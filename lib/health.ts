import { isTestDepartment } from "@/lib/query";
import type { StateDeptTotal } from "@/lib/amplitude-parse";

/**
 * Pure CS-health logic: join two windows of per-(state,department) totals into
 * per-agency month-over-month deltas, classify them, and summarize. No I/O, no
 * credentials — unit tested in lib/__tests__/health.test.ts.
 */

export type HealthStatus = "decliner" | "riser" | "new" | "stable";

export interface AgencyHealth {
  department: string;
  state: string;
  current: number;
  prior: number;
  deltaAbs: number;
  /** null when prior volume is below the floor (sub-floor % is meaningless / new-or-activated agency) — never shown as a %. */
  deltaPct: number | null;
  status: HealthStatus;
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

export function computeHealth(
  current: StateDeptTotal[],
  prior: StateDeptTotal[],
  opts: HealthOptions,
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
    return {
      department: acc.department,
      state: acc.state,
      current: acc.current,
      prior: acc.prior,
      deltaAbs,
      deltaPct,
      status: classify(acc.current, acc.prior, opts),
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
