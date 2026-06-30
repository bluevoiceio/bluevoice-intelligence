import { isTestDepartment } from "@/lib/query";
import { STATE_NAME_TO_USPS } from "@/lib/states";
import type { StateDeptTotal } from "@/lib/amplitude-parse";

/**
 * Pure CS-health logic: join two windows of per-(state,department) totals into
 * per-agency month-over-month deltas, classify them, attach optional enrichment
 * signals (weekly trend, active officers, answer quality), score them, and
 * summarize. No I/O, no credentials — unit tested in lib/__tests__/health.test.ts.
 */

export type HealthStatus = "decliner" | "riser" | "new" | "stable";

export interface AgencyHealth {
  department: string;
  state: string;
  /** USPS code for the state (compact chips / cartogram joins). */
  usps: string;
  current: number;
  prior: number;
  deltaAbs: number;
  /** null when prior volume is below the floor (sub-floor % is meaningless / new-or-activated agency) — never shown as a %. */
  deltaPct: number | null;
  status: HealthStatus;
  /** Composite renewal-health score 0–100 (trend + whatever signals are present). */
  score: number;
  // --- optional enrichment (present when the route supplies it) -------------
  /** Weekly question counts, oldest → newest (sparklines, slopegraphs). */
  series?: number[];
  /** Unique active officers in the current window (Amplitude uniques). */
  activeOfficers?: number;
  /** Provisioned officer seats, when a source is available (else undefined). */
  provisionedOfficers?: number;
  /** activeOfficers / provisionedOfficers, when both are known. */
  breadth?: number;
  /** Better-Answer clicks ÷ questions in the current window (higher = worse). */
  betterAnswerRate?: number;
}

export interface HealthSummary {
  totalCurrent: number;
  totalPrior: number;
  atRiskCount: number;
  risingCount: number;
  newCount: number;
  topDecliners: AgencyHealth[];
  topRisers: AgencyHealth[];
  topNew: AgencyHealth[];
  topStateShare: { state: string; pct: number }[];
}

export interface HealthResponse {
  agencies: AgencyHealth[];
  summary: HealthSummary;
  brief: string;
}

export interface HealthOptions {
  hideTest: boolean;
  /** Minimum prior-window volume to be eligible for decliner/riser. */
  floor: number;
  /** Percentage drop (positive number) that marks a decliner. */
  declinePct: number;
  /** Percentage rise that marks a riser. */
  risePct: number;
}

/**
 * Optional per-agency enrichment, keyed by `${state}|${department}` (the same
 * composite key computeHealth uses internally). Any map may be omitted; the
 * score reweights over whichever signals are present.
 */
export interface HealthEnrichment {
  /** Weekly question series (oldest → newest) per agency. */
  series?: Map<string, number[]>;
  /** Unique active officers in the current window per agency. */
  activeOfficers?: Map<string, number>;
  /** Provisioned officer seats per agency (rarely available). */
  provisionedOfficers?: Map<string, number>;
  /** Better-Answer-Clicked totals in the current window per agency. */
  betterAnswers?: Map<string, number>;
}

export const HEALTH_DEFAULTS = { floor: 50, declinePct: 25, risePct: 25 };

const NONE = "(none)";

interface Acc {
  department: string;
  state: string;
  current: number;
  prior: number;
}

function classify(current: number, prior: number, opts: HealthOptions): HealthStatus {
  if (prior < opts.floor) {
    return current >= opts.floor ? "new" : "stable";
  }
  const pct = ((current - prior) / prior) * 100;
  if (pct <= -opts.declinePct) return "decliner";
  if (pct >= opts.risePct) return "riser";
  return "stable";
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Composite 0–100 health score. Weights: trend 45%, officer breadth 30%,
 * answer quality 25% — but only over the signals actually present, so an agency
 * with just current/prior is still scored on trend alone.
 */
export function computeScore(
  deltaPct: number | null,
  status: HealthStatus,
  breadth?: number,
  betterAnswerRate?: number,
): number {
  const trend =
    status === "new" ? 0.72 : deltaPct == null ? 0.6 : clamp01((deltaPct + 50) / 100);
  const parts: Array<[number, number]> = [[0.45, trend]];
  if (breadth != null) parts.push([0.3, clamp01(breadth)]);
  if (betterAnswerRate != null) {
    parts.push([0.25, clamp01((0.09 - betterAnswerRate) / (0.09 - 0.02))]);
  }
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const v = parts.reduce((s, [w, val]) => s + w * val, 0) / wsum;
  return Math.round(100 * v);
}

/**
 * A short human "why" sentence for an agency, from its strongest available
 * signal. Degrades gracefully when enrichment (breadth/quality) is absent.
 */
export function driverFor(a: AgencyHealth): string {
  const dormantPct = a.breadth != null ? Math.round((1 - a.breadth) * 100) : null;
  if (a.status === "riser")
    return a.breadth != null && a.breadth > 0.8
      ? "Accelerating — expansion candidate"
      : "Adoption climbing fast";
  if (a.status === "new") return "Newly activated — nurture";
  if (a.status === "decliner") {
    if (dormantPct != null && a.breadth! < 0.45) return `Usage falling + ${dormantPct}% of seats dormant`;
    if (a.betterAnswerRate != null && a.betterAnswerRate >= 0.05)
      return "Usage falling + answer quality slipping";
    return "Usage falling month-over-month";
  }
  if (dormantPct != null && a.breadth! < 0.45) return `Flat, but ${dormantPct}% of seats dormant`;
  if (a.betterAnswerRate != null && a.betterAnswerRate >= 0.05)
    return "Stable usage, answer quality to watch";
  if (a.breadth != null && a.breadth > 0.85) return "Healthy — upsell candidate";
  return "Stable usage";
}

export function computeHealth(
  current: StateDeptTotal[],
  prior: StateDeptTotal[],
  opts: HealthOptions,
  enrichment?: HealthEnrichment,
): { agencies: AgencyHealth[]; summary: HealthSummary } {
  // Key by (state, department) so same-named departments in different states
  // are treated as separate agencies — one agency always maps to one state.
  const byKey = new Map<string, Acc>();

  const ingest = (rows: StateDeptTotal[], field: "current" | "prior") => {
    for (const row of rows) {
      const dept = row.department.trim();
      const state = row.state?.trim() ?? "";
      if (!dept || dept === NONE) continue;
      if (!state || state === NONE) continue;
      if (opts.hideTest && isTestDepartment(dept)) continue;
      const key = `${state}\t${dept}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { department: dept, state, current: 0, prior: 0 };
        byKey.set(key, acc);
      }
      acc[field] += row.total;
    }
  };

  ingest(current, "current");
  ingest(prior, "prior");

  const agencies: AgencyHealth[] = [...byKey.values()].map((acc) => {
    const deltaAbs = acc.current - acc.prior;
    const deltaPct = acc.prior >= opts.floor ? (deltaAbs / acc.prior) * 100 : null;
    const status = classify(acc.current, acc.prior, opts);

    // Enrichment lookups use the API's "state|dept" key (note: ingest keys on a
    // tab, the enrichment maps key on a pipe — keep them in sync with the route).
    const ekey = `${acc.state}|${acc.department}`;
    const series = enrichment?.series?.get(ekey);
    const activeOfficers = enrichment?.activeOfficers?.get(ekey);
    const provisionedOfficers = enrichment?.provisionedOfficers?.get(ekey);
    const breadth =
      activeOfficers != null && provisionedOfficers && provisionedOfficers > 0
        ? activeOfficers / provisionedOfficers
        : undefined;
    const betterAnswersN = enrichment?.betterAnswers?.get(ekey);
    const betterAnswerRate =
      betterAnswersN != null && acc.current > 0
        ? clamp01(betterAnswersN / acc.current)
        : undefined;

    return {
      department: acc.department,
      state: acc.state,
      usps: STATE_NAME_TO_USPS[acc.state] ?? acc.state,
      current: acc.current,
      prior: acc.prior,
      deltaAbs,
      deltaPct,
      status,
      score: computeScore(deltaPct, status, breadth, betterAnswerRate),
      series,
      activeOfficers,
      provisionedOfficers,
      breadth,
      betterAnswerRate,
    };
  });

  // Default sort: at-risk first, then by absolute swing magnitude.
  const rank = (s: HealthStatus) =>
    s === "decliner" ? 0 : s === "riser" ? 1 : s === "new" ? 2 : 3;
  agencies.sort(
    (a, b) => rank(a.status) - rank(b.status) || Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs),
  );

  const decliners = agencies
    .filter((a) => a.status === "decliner")
    .sort((a, b) => a.deltaAbs - b.deltaAbs); // most negative first
  const risers = agencies
    .filter((a) => a.status === "riser")
    .sort((a, b) => b.deltaAbs - a.deltaAbs);
  const news = agencies
    .filter((a) => a.status === "new")
    .sort((a, b) => b.current - a.current);

  const totalCurrent = agencies.reduce((sum, a) => sum + a.current, 0);
  const totalPrior = agencies.reduce((sum, a) => sum + a.prior, 0);

  // Each agency has exactly one state (guaranteed by composite keying above).
  const byState = new Map<string, number>();
  for (const a of agencies) {
    byState.set(a.state, (byState.get(a.state) ?? 0) + a.current);
  }
  const topStateShare = [...byState.entries()]
    .map(([state, vol]) => ({ state, pct: totalCurrent > 0 ? (vol / totalCurrent) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const summary: HealthSummary = {
    totalCurrent,
    totalPrior,
    atRiskCount: decliners.length,
    risingCount: risers.length,
    newCount: news.length,
    topDecliners: decliners.slice(0, 5),
    topRisers: risers.slice(0, 5),
    topNew: news.slice(0, 5),
    topStateShare,
  };

  return { agencies, summary };
}
