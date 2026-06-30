import type { StateDeptTotal } from "@/lib/amplitude-parse";
import { isTestDepartment } from "@/lib/query";
import { STATE_NAME_TO_USPS } from "@/lib/states";

/**
 * Pure four-lens account-intelligence scoring. Pivots the analytics from
 * "events over time" to "the account (state, department) as the row": each
 * account is scored on four lenses — momentum (usage trend), trust (answer
 * quality), breadth (product-pillar adoption) and activation (time-to-value) —
 * then blended into one composite 0–100 score and banded red/yellow/green.
 *
 * No I/O, no credentials. The route assembles AccountInput[] from per-(state,
 * department) Amplitude segmentation totals and hands them here. Unit tested in
 * lib/__tests__/intelligence.test.ts. Mirrors the pure/IO split of lib/health.ts.
 *
 * Weights and friction bands below are reasoned v1 defaults (the research is
 * unanimous that weights should be UNEQUAL and value-weighted, but the exact
 * numbers are rules-of-thumb) — calibrate against known healthy/at-risk
 * departments before treating any single score as ground truth.
 */

export type HealthStatus = "decliner" | "riser" | "new" | "stable";
export type Band = "green" | "yellow" | "red";

/**
 * Current-window totals per product pillar. The pillars are the surfaces the
 * business actually values (sold features + the compliance loop) — not raw
 * event categories — so the breadth lens reads as "what to pitch next".
 */
export interface PillarUsage {
  ask: number; // Q&A — New Question Asked (the core)
  documents: number; // reports & forms — PDF Loaded
  workspace: number; // analysis/policy/accreditation — Workspace Chat Sent
  redaction: number; // marquee sold feature — Redaction Created
  compliance: number; // notifications + sign-off acknowledgment loop
}

/**
 * One account's assembled signals. Only `state`, `department`, `current` and
 * `prior` are required; every lens beyond momentum is optional and the score
 * reweights over whichever signals are actually present.
 */
export interface AccountInput {
  state: string;
  department: string;
  // Momentum (value event, e.g. New Question Asked)
  current: number;
  prior: number;
  // Trust / answer quality (current window)
  /** Denominator for friction rates; defaults to `current` when omitted. */
  questions?: number;
  betterAnswers?: number;
  downvotes?: number;
  formOk?: number;
  formFails?: number;
  // Breadth (product-pillar adoption)
  pillars?: PillarUsage;
  // Activation / time-to-value (uniques)
  firstLogins?: number;
  activatedOfficers?: number;
  /** Unique active officers — normalization denominator for size-fair compare. */
  activeOfficers?: number;
}

export interface LensScores {
  /** 0–100, always present (every account has usage trend). */
  momentum: number;
  /** 0–100, null when no answer-quality signals were supplied. */
  trust: number | null;
  /** 0–100, null when no pillar data was supplied. */
  breadth: number | null;
  /** 0–100, null when there are no first logins to measure. */
  activation: number | null;
}

export interface AccountIntelligence {
  state: string;
  department: string;
  usps: string;
  current: number;
  prior: number;
  /** null when prior volume is below the floor (sub-floor % is meaningless). */
  deltaPct: number | null;
  status: HealthStatus;
  /** Composite 0–100 across whichever lenses are present. */
  composite: number;
  band: Band;
  lenses: LensScores;
  /** How many of the four product pillars the account actively uses (0–4). */
  pillarsUsed: number;
  /** Per-pillar usage in the current window (present when pillar data ran). */
  pillars?: PillarUsage;
}

export interface IntelligenceSummary {
  total: number;
  bands: Record<Band, number>;
}

/** Shape returned by GET /api/intelligence. */
export interface IntelligenceResponse {
  accounts: AccountIntelligence[];
  summary: IntelligenceSummary;
  /** Pillar keys whose upstream fetch failed — shown as "—", never as 0%. */
  unavailablePillars?: string[];
}

export interface IntelligenceOptions {
  hideTest: boolean;
  /** Minimum prior-window volume for a real % delta. */
  floor: number;
  declinePct: number;
  risePct: number;
}

export const INTELLIGENCE_DEFAULTS = { floor: 50, declinePct: 25, risePct: 25 };

/** Lens weights — reweighted over present lenses; momentum is always present. */
const WEIGHTS = { momentum: 0.35, trust: 0.25, breadth: 0.2, activation: 0.2 };

/** Friction sub-signals: [good, bad] rate band + relative weight within trust. */
const TRUST = {
  betterAnswer: { good: 0.02, bad: 0.09, w: 0.5 },
  downvote: { good: 0, bad: 0.03, w: 0.3 },
  formFail: { good: 0, bad: 0.4, w: 0.2 },
};

/** Per-pillar breadth weight — Ask is table stakes; the rest prove depth. Σ = 1. */
const PILLAR_W = { ask: 0.12, documents: 0.22, workspace: 0.22, redaction: 0.22, compliance: 0.22 };

/** Activation rate that earns full marks. */
const ACTIVATION_TARGET = 0.6;

const NONE = "(none)";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Map a raw rate onto 0–1 "badness" across a [good, bad] band. */
function norm(x: number, good: number, bad: number): number {
  return clamp01((x - good) / (bad - good));
}

function classify(current: number, prior: number, opts: IntelligenceOptions): HealthStatus {
  if (prior < opts.floor) return current >= opts.floor ? "new" : "stable";
  const pct = ((current - prior) / prior) * 100;
  if (pct <= -opts.declinePct) return "decliner";
  if (pct >= opts.risePct) return "riser";
  return "stable";
}

function momentumScore(deltaPct: number | null, status: HealthStatus): number {
  if (status === "new") return 0.72;
  if (deltaPct == null) return 0.6;
  return clamp01((deltaPct + 50) / 100);
}

function trustScore(a: AccountInput): number | null {
  const denom = a.questions ?? a.current;
  const parts: Array<[number, number]> = [];
  if (a.betterAnswers != null && denom > 0)
    parts.push([TRUST.betterAnswer.w, norm(a.betterAnswers / denom, TRUST.betterAnswer.good, TRUST.betterAnswer.bad)]);
  if (a.downvotes != null && denom > 0)
    parts.push([TRUST.downvote.w, norm(a.downvotes / denom, TRUST.downvote.good, TRUST.downvote.bad)]);
  const formTotal = (a.formOk ?? 0) + (a.formFails ?? 0);
  if (a.formFails != null && formTotal > 0)
    parts.push([TRUST.formFail.w, norm(a.formFails / formTotal, TRUST.formFail.good, TRUST.formFail.bad)]);
  if (parts.length === 0) return null;
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const badness = parts.reduce((s, [w, v]) => s + w * v, 0) / wsum;
  return clamp01(1 - badness);
}

function breadthScore(p: PillarUsage | undefined): { score: number | null; used: number } {
  if (!p) return { score: null, used: 0 };
  const used = [p.ask, p.documents, p.workspace, p.redaction, p.compliance].filter((v) => v > 0).length;
  const score =
    (p.ask > 0 ? PILLAR_W.ask : 0) +
    (p.documents > 0 ? PILLAR_W.documents : 0) +
    (p.workspace > 0 ? PILLAR_W.workspace : 0) +
    (p.redaction > 0 ? PILLAR_W.redaction : 0) +
    (p.compliance > 0 ? PILLAR_W.compliance : 0);
  return { score: clamp01(score), used };
}

function activationScore(a: AccountInput): number | null {
  if (a.firstLogins == null || a.firstLogins <= 0) return null;
  const rate = clamp01((a.activatedOfficers ?? 0) / a.firstLogins);
  return clamp01(rate / ACTIVATION_TARGET);
}

function bandFor(composite: number): Band {
  if (composite >= 75) return "green";
  if (composite >= 40) return "yellow";
  return "red";
}

/**
 * Per-signal per-(state,department) totals straight from Amplitude segmentation.
 * `current`/`prior` (the momentum spine) are required; every other batch is
 * optional — the route supplies it only when that `Promise.allSettled` slot
 * fulfilled, so a throttled secondary call simply leaves its lens null.
 */
export interface IntelligenceSignals {
  current: StateDeptTotal[];
  prior: StateDeptTotal[];
  documents?: StateDeptTotal[];
  workspace?: StateDeptTotal[];
  redaction?: StateDeptTotal[];
  compliance?: StateDeptTotal[];
  betterAnswers?: StateDeptTotal[];
  downvotes?: StateDeptTotal[];
  firstLogins?: StateDeptTotal[];
  activatedOfficers?: StateDeptTotal[];
}

function indexByKey(rows?: StateDeptTotal[]): Map<string, number> | undefined {
  if (!rows) return undefined;
  const m = new Map<string, number>();
  for (const r of rows) m.set(`${r.state}|${r.department}`, r.total);
  return m;
}

/**
 * Join the per-signal segmentation batches into one `AccountInput` per account.
 * Accounts come from the union of the current+prior windows (the momentum
 * spine); each optional batch attaches its field only when it ran (a fulfilled
 * batch with no row for an account means 0, an absent batch means "unknown").
 * Pure — unit tested; the route is a thin fan-out shell over this.
 */
export function buildAccountInputs(signals: IntelligenceSignals): AccountInput[] {
  const acc = new Map<string, { state: string; department: string; current: number; prior: number }>();
  const ingest = (rows: StateDeptTotal[], field: "current" | "prior") => {
    for (const r of rows) {
      const key = `${r.state}|${r.department}`;
      let a = acc.get(key);
      if (!a) {
        a = { state: r.state, department: r.department, current: 0, prior: 0 };
        acc.set(key, a);
      }
      a[field] += r.total;
    }
  };
  ingest(signals.current, "current");
  ingest(signals.prior, "prior");

  const documents = indexByKey(signals.documents);
  const workspace = indexByKey(signals.workspace);
  const redaction = indexByKey(signals.redaction);
  const compliance = indexByKey(signals.compliance);
  const hasPillars = !!(signals.documents || signals.workspace || signals.redaction || signals.compliance);
  const better = indexByKey(signals.betterAnswers);
  const down = indexByKey(signals.downvotes);
  const firstLogins = indexByKey(signals.firstLogins);
  const activated = indexByKey(signals.activatedOfficers);

  return [...acc.values()].map((a) => {
    const key = `${a.state}|${a.department}`;
    const input: AccountInput = {
      state: a.state,
      department: a.department,
      current: a.current,
      prior: a.prior,
    };
    if (hasPillars) {
      input.pillars = {
        ask: a.current, // questions in the current window IS the Ask pillar
        documents: documents?.get(key) ?? 0,
        workspace: workspace?.get(key) ?? 0,
        redaction: redaction?.get(key) ?? 0,
        compliance: compliance?.get(key) ?? 0,
      };
    }
    if (better) input.betterAnswers = better.get(key) ?? 0;
    if (down) input.downvotes = down.get(key) ?? 0;
    if (firstLogins) input.firstLogins = firstLogins.get(key) ?? 0;
    if (activated) input.activatedOfficers = activated.get(key) ?? 0;
    return input;
  });
}

export function computeIntelligence(
  inputs: AccountInput[],
  opts: IntelligenceOptions,
): { accounts: AccountIntelligence[]; summary: IntelligenceSummary } {
  const accounts: AccountIntelligence[] = [];

  for (const a of inputs) {
    const dept = a.department.trim();
    const state = a.state?.trim() ?? "";
    if (!dept || dept === NONE) continue;
    if (!state || state === NONE) continue;
    if (opts.hideTest && isTestDepartment(dept)) continue;

    const deltaPct = a.prior >= opts.floor ? ((a.current - a.prior) / a.prior) * 100 : null;
    const status = classify(a.current, a.prior, opts);

    const m = momentumScore(deltaPct, status);
    const t = trustScore(a);
    const { score: b, used } = breadthScore(a.pillars);
    const act = activationScore(a);

    const parts: Array<[number, number]> = [[WEIGHTS.momentum, m]];
    if (t != null) parts.push([WEIGHTS.trust, t]);
    if (b != null) parts.push([WEIGHTS.breadth, b]);
    if (act != null) parts.push([WEIGHTS.activation, act]);
    const wsum = parts.reduce((s, [w]) => s + w, 0);
    const composite = Math.round((100 * parts.reduce((s, [w, v]) => s + w * v, 0)) / wsum);

    accounts.push({
      state,
      department: dept,
      usps: STATE_NAME_TO_USPS[state] ?? state,
      current: a.current,
      prior: a.prior,
      deltaPct,
      status,
      composite,
      band: bandFor(composite),
      lenses: {
        momentum: Math.round(100 * m),
        trust: t == null ? null : Math.round(100 * t),
        breadth: b == null ? null : Math.round(100 * b),
        activation: act == null ? null : Math.round(100 * act),
      },
      pillarsUsed: used,
      pillars: a.pillars,
    });
  }

  // Most at-risk first — leadership and CS read the top of the list.
  accounts.sort((x, y) => x.composite - y.composite);

  const bands: Record<Band, number> = { green: 0, yellow: 0, red: 0 };
  for (const a of accounts) bands[a.band] += 1;

  return { accounts, summary: { total: accounts.length, bands } };
}
