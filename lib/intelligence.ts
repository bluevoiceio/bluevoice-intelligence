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
  // Realization (outcomes shipped this window — proof of delivered value)
  formsAiFilled?: number;
  formsEmailed?: number;
  artifactsExported?: number;
  /** Policy sign-offs reviewed — the core accreditation outcome. */
  signoffs?: number;
  // Breadth (product-pillar adoption)
  pillars?: PillarUsage;
  // Activation / time-to-value (uniques)
  firstLogins?: number;
  activatedOfficers?: number;
  /** Unique active officers — normalization denominator for size-fair compare. */
  activeOfficers?: number;
}

export interface LensScores {
  /** 0–100, always present — absolute usage level vs the book (adoption). */
  activity: number;
  /** 0–100, always present (every account has usage trend). */
  momentum: number;
  /** 0–100, null when no answer-quality signals were supplied. */
  trust: number | null;
  /** 0–100, null when no pillar data was supplied. */
  breadth: number | null;
  /** 0–100, null when no outcome (shipped-value) signals were supplied. */
  realization: number | null;
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

/** Health-lens weights — the engagement signals only (value delivered is upside,
 *  not health). Activity (absolute usage) carries the most weight: low adoption
 *  is the top churn signal. Reweighted over present lenses; activity & momentum
 *  are always present. */
const WEIGHTS = { activity: 0.3, momentum: 0.16, trust: 0.21, breadth: 0.18, activation: 0.15 };

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

/** The percentile of the book's shippers that earns full value-delivered marks
 *  — graded on a curve vs peers rather than a guessed absolute target. */
const REALIZATION_PCTL = 0.8;

/**
 * Floor applied to each lens before geometric aggregation. A literal 0 in a
 * geometric mean would annihilate the whole composite; flooring caps the
 * penalty so a dead lens drags hard but doesn't zero an otherwise-strong
 * account. Standard OECD composite-indicator practice for geometric blends.
 * Calibrated to 0.12 against live data: 0.05 left the green band unreachable
 * once the realization lens (zero for ~90% of accounts) joined the blend.
 */
const LENS_FLOOR = 0.12;

const NONE = "(none)";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Weighted GEOMETRIC mean of [weight, value] pairs (values in 0–1). Unlike a
 * weighted arithmetic mean, one weak lens drags the whole score down — being
 * elite on three pillars can't mask a dead fourth (the AM–GM inequality:
 * geometric ≤ arithmetic, with equality only when all lenses are equal). This
 * is the "penalize the weakest link" property the account-health research
 * calls for. Values are floored at LENS_FLOOR so a 0 caps, not zeroes, the
 * composite.
 */
function weightedGeoMean(parts: Array<[number, number]>): number {
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const ln = parts.reduce((s, [w, v]) => s + w * Math.log(Math.max(v, LENS_FLOOR)), 0);
  return Math.exp(ln / wsum);
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

/**
 * Activity / adoption level — where this account's current usage volume ranks
 * against the whole book (midrank percentile, 0–1). Captures the dimension the
 * rate-based lenses miss: a barely-used account has great rates (no decline, no
 * friction) but low absolute usage, which is the top churn signal. `sortedVols`
 * is the ascending list of every kept account's `current`.
 */
function activityScore(current: number, sortedVols: number[]): number {
  const n = sortedVols.length;
  if (n <= 1) return 0.6; // a one-account book has no peers to rank against
  let below = 0;
  let equal = 0;
  for (const v of sortedVols) {
    if (v < current) below++;
    else if (v === current) equal++;
  }
  return clamp01((below + equal / 2) / n);
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

/**
 * Outcome density — shipped work products per question. Counts every concrete
 * deliverable: AI-filled & emailed forms, exported artifacts, redactions, and
 * policy sign-offs (the core accreditation outcome). Null only when no outcome
 * batch ran (so the lens reweights away cleanly); 0 outcomes against real usage
 * is a true zero (a "browser" account that never ships).
 */
function realizationDensity(a: AccountInput): number | null {
  if (
    a.formsAiFilled == null &&
    a.formsEmailed == null &&
    a.artifactsExported == null &&
    a.signoffs == null
  )
    return null;
  const outcomes =
    (a.formsAiFilled ?? 0) +
    (a.formsEmailed ?? 0) +
    (a.artifactsExported ?? 0) +
    (a.signoffs ?? 0) +
    (a.pillars?.redaction ?? 0);
  const denom = a.questions ?? a.current;
  if (denom <= 0) return outcomes > 0 ? Infinity : 0;
  return outcomes / denom;
}

/**
 * Value-delivered score, graded on a curve against the book's own shippers:
 * full marks at `ref` (the REALIZATION_PCTL-percentile outcome density among
 * accounts that ship anything), linear below it. Replaces a guessed absolute
 * target so the lens self-calibrates and credits partial outcomes. Null when no
 * outcome data; 0 when nobody in the book ships.
 */
function realizationScore(a: AccountInput, ref: number): number | null {
  const d = realizationDensity(a);
  if (d == null) return null;
  if (ref <= 0) return 0;
  return clamp01(d / ref);
}

/** Linear-interpolated percentile of an ascending-sorted array (p in 0–1). */
function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

/** Single source of truth for score→band. Green ≥66 (calibrated to the live
 *  engagement-health distribution), yellow 40–65, red <40. */
export function bandFor(composite: number): Band {
  if (composite >= 66) return "green";
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
  formsAiFilled?: StateDeptTotal[];
  formsEmailed?: StateDeptTotal[];
  artifactsExported?: StateDeptTotal[];
  signoffs?: StateDeptTotal[];
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
  const aiFilled = indexByKey(signals.formsAiFilled);
  const emailed = indexByKey(signals.formsEmailed);
  const exported = indexByKey(signals.artifactsExported);
  const signoffsIdx = indexByKey(signals.signoffs);
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
    if (aiFilled) input.formsAiFilled = aiFilled.get(key) ?? 0;
    if (emailed) input.formsEmailed = emailed.get(key) ?? 0;
    if (exported) input.artifactsExported = exported.get(key) ?? 0;
    if (signoffsIdx) input.signoffs = signoffsIdx.get(key) ?? 0;
    if (firstLogins) input.firstLogins = firstLogins.get(key) ?? 0;
    if (activated) input.activatedOfficers = activated.get(key) ?? 0;
    return input;
  });
}

/** The prescriptive layer: which CS/sales play this account points to. `kind`
 *  is the stable discriminator (for filtering/icons); `play`/`detail` are the
 *  human "so-what". */
export type PlayKind =
  | "onboard"
  | "intervene"
  | "realization"
  | "cross-sell"
  | "trust"
  | "reengage"
  | "reference"
  | "broaden";

export interface Recommendation {
  kind: PlayKind;
  play: string;
  detail: string;
}

/** Total product pillars the breadth lens tracks (PillarUsage keys). */
const PILLAR_TOTAL = 5;
/** A lens at or above this is "fine" — recommendations target the weakest gap. */
const PLAY_OK = 65;

/**
 * Turn one scored account into its single highest-leverage next play. Declining
 * usage (the top churn signal) and brand-new accounts short-circuit; otherwise
 * the weakest present lens names the play — value isn't a wall of charts, it's
 * one recommended action per row (the research's prescriptive principle).
 */
export function recommend(a: AccountIntelligence): Recommendation {
  if (a.status === "new")
    return { kind: "onboard", play: "Onboard & nurture", detail: "Newly active — guide them to first value before momentum fades." };
  if (a.status === "decliner")
    return { kind: "intervene", play: "Intervene — usage sliding", detail: "Questions are falling month-over-month; a CSM check-in is the at-risk play." };

  const present = (
    [
      ["activity", a.lenses.activity],
      ["momentum", a.lenses.momentum],
      ["trust", a.lenses.trust],
      ["realization", a.lenses.realization],
      ["breadth", a.lenses.breadth],
      ["activation", a.lenses.activation],
    ] as Array<[string, number | null]>
  ).filter((x): x is [string, number] => x[1] != null);
  const weakest = [...present].sort((x, y) => x[1] - y[1])[0];

  if (!weakest || weakest[1] >= PLAY_OK)
    return a.pillarsUsed >= 4
      ? { kind: "reference", play: "Expansion proof point", detail: "Healthy across the board — a reference account and upsell candidate." }
      : { kind: "broaden", play: "Broaden adoption", detail: "Healthy usage, but whitespace remains in unused pillars." };

  switch (weakest[0]) {
    case "realization":
      return { kind: "realization", play: "Turn usage into outcomes", detail: "Plenty of activity but few outcomes shipped — enable AI forms, redaction and exports." };
    case "breadth":
      return { kind: "cross-sell", play: "Broaden feature use", detail: `Only ${a.pillarsUsed} of ${PILLAR_TOTAL} features in use — the clearest expansion path.` };
    case "trust":
      return { kind: "trust", play: "Fix answer quality", detail: "Friction and re-asks are rising — review answer relevance." };
    case "activity":
      return { kind: "reengage", play: "Drive daily adoption", detail: "Low usage versus the book — get more of the team asking day-to-day." };
    case "activation":
      return { kind: "onboard", play: "Accelerate onboarding", detail: "New officers are slow to reach first value." };
    default:
      return { kind: "reengage", play: "Re-engage — usage soft", detail: "Usage trend is the weakest signal; reinforce the core workflows." };
  }
}

export function computeIntelligence(
  inputs: AccountInput[],
  opts: IntelligenceOptions,
): { accounts: AccountIntelligence[]; summary: IntelligenceSummary } {
  // Filter to real, displayable accounts first so the peer reference below is
  // computed over exactly the book we score (not test/demo or (none) rows).
  const kept = inputs.filter((a) => {
    const dept = a.department.trim();
    const state = a.state?.trim() ?? "";
    if (!dept || dept === NONE) return false;
    if (!state || state === NONE) return false;
    if (opts.hideTest && isTestDepartment(dept)) return false;
    return true;
  });

  // Value-delivered reference: the REALIZATION_PCTL-percentile outcome density
  // among accounts that ship anything, so the lens grades on a curve vs peers.
  const positiveDensities = kept
    .map(realizationDensity)
    .filter((d): d is number => d != null && d > 0 && Number.isFinite(d))
    .sort((x, y) => x - y);
  const realizationRef = percentile(positiveDensities, REALIZATION_PCTL);

  // Activity reference: every account's usage volume, for percentile ranking.
  const sortedVols = kept.map((a) => a.current).sort((x, y) => x - y);

  const accounts: AccountIntelligence[] = [];

  for (const a of kept) {
    const dept = a.department.trim();
    const state = a.state?.trim() ?? "";

    const deltaPct = a.prior >= opts.floor ? ((a.current - a.prior) / a.prior) * 100 : null;
    const status = classify(a.current, a.prior, opts);

    const actv = activityScore(a.current, sortedVols);
    const m = momentumScore(deltaPct, status);
    const t = trustScore(a);
    const { score: b, used } = breadthScore(a.pillars);
    const r = realizationScore(a, realizationRef);
    const act = activationScore(a);

    // Health = engagement & satisfaction only (usage, answer quality, feature
    // adoption, onboarding). Value delivered (`r`) is deliberately NOT in the
    // composite — for a Q&A-first product an engaged, well-served agency is
    // healthy; outcomes shipped are expansion UPSIDE, shown as a lens and used
    // by `recommend`, not a drag on the health score.
    const parts: Array<[number, number]> = [
      [WEIGHTS.activity, actv],
      [WEIGHTS.momentum, m],
    ];
    if (t != null) parts.push([WEIGHTS.trust, t]);
    if (b != null) parts.push([WEIGHTS.breadth, b]);
    if (act != null) parts.push([WEIGHTS.activation, act]);
    const composite = Math.round(100 * weightedGeoMean(parts));

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
        activity: Math.round(100 * actv),
        momentum: Math.round(100 * m),
        trust: t == null ? null : Math.round(100 * t),
        breadth: b == null ? null : Math.round(100 * b),
        realization: r == null ? null : Math.round(100 * r),
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
