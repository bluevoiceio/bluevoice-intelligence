import type { GroupTotal } from "@/lib/types";

/**
 * Pure parsing + aggregation for Amplitude Event Segmentation responses.
 *
 * Kept free of `server-only`, `fetch`, and credentials so it can be unit
 * tested in isolation (see lib/__tests__/amplitude-parse.test.ts). The I/O
 * shell lives in lib/amplitude.ts and delegates here.
 */

export interface RawSegmentation {
  data?: {
    series?: number[][];
    seriesCollapsed?: Array<Array<{ value?: number; setId?: string }>>;
    seriesLabels?: unknown[];
    segmentationValues?: unknown[];
    xValues?: string[];
  };
}

export interface ParsedSeries {
  /** Group-by values for this series, e.g. ["Massachusetts", "Quincy PD"]. */
  parts: string[];
  total: number;
  series: number[];
}

export function sum(values: number[] | undefined): number {
  return (values ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Coerce one label entry into an ordered list of group-by string parts. */
export function labelToParts(label: unknown): string[] {
  if (label == null) return [];
  if (typeof label === "string") return [label];
  if (typeof label === "number") return [String(label)];
  if (Array.isArray(label)) {
    // Could be ["MA", "Quincy PD"] or [index, "MA"]; drop a leading index.
    const flat = label.map((x) => (x == null ? "" : String(x)));
    if (flat.length >= 2 && /^\d+$/.test(flat[0]) && typeof label[1] === "string") {
      return flat.slice(1);
    }
    return flat;
  }
  if (typeof label === "object") {
    const obj = label as Record<string, unknown>;
    const v = obj.value ?? obj.name ?? obj.group_value ?? obj.segment;
    if (v != null) return labelToParts(v);
  }
  return [String(label)];
}

export function parseSegmentation(raw: RawSegmentation): {
  parsed: ParsedSeries[];
  xValues: string[];
} {
  const data = raw.data ?? {};
  const series = data.series ?? [];
  const labelSource = data.seriesLabels ?? data.segmentationValues ?? [];
  const collapsed = data.seriesCollapsed ?? [];

  const parsed: ParsedSeries[] = series.map((s, i) => {
    const collapsedTotal = collapsed[i]?.[0]?.value;
    const total = typeof collapsedTotal === "number" ? collapsedTotal : sum(s);
    return {
      parts: labelToParts(labelSource[i]),
      total,
      series: s ?? [],
    };
  });

  return { parsed, xValues: data.xValues ?? [] };
}

const NONE = "(none)";

function trailingPart(parts: string[]): string {
  return (parts[parts.length - 1] ?? "").trim();
}

export interface GeoAggregate {
  byState: Record<string, number>;
  total: number;
  activeStates: number;
  untagged: number;
}

/** Aggregate a State-grouped response into per-state totals. */
export function aggregateGeo(parsed: ParsedSeries[]): GeoAggregate {
  const byState: Record<string, number> = {};
  let untagged = 0;
  for (const row of parsed) {
    const name = trailingPart(row.parts);
    if (!name || name.toLowerCase() === NONE) {
      untagged += row.total;
      continue;
    }
    byState[name] = (byState[name] ?? 0) + row.total;
  }
  const total = Object.values(byState).reduce((a, b) => a + b, 0);
  return { byState, total, activeStates: Object.keys(byState).length, untagged };
}

/**
 * Collapse a State+dimension response to the trailing group-by part (the
 * dimension that varies once the State filter is applied), sorted desc.
 */
export function aggregateBreakdown(parsed: ParsedSeries[]): GroupTotal[] {
  const byKey = new Map<string, number>();
  for (const row of parsed) {
    const key = trailingPart(row.parts) || NONE;
    byKey.set(key, (byKey.get(key) ?? 0) + row.total);
  }
  return [...byKey.entries()]
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total);
}

export interface StateDeptTotal {
  state: string;
  department: string;
  total: number;
}

/**
 * Collapse a [State, Department]-grouped response into per-(state,department)
 * totals, preserving BOTH parts (unlike aggregateBreakdown, which keeps only
 * the trailing part).
 *
 * Amplitude returns a two-dimension group-by as a single joined label, e.g.
 * "Massachusetts; Quincy PD" — NOT a ["Massachusetts", "Quincy PD"] array. We
 * split that back apart on the first "; " so parts[0] is the State and the
 * trailing part is the Department. A single part with no separator has no
 * State → "(none)".
 */
export function aggregateStateDept(parsed: ParsedSeries[]): StateDeptTotal[] {
  const byKey = new Map<string, StateDeptTotal>();
  for (const row of parsed) {
    let parts = row.parts.map((p) => p.trim());
    if (parts.length === 1 && parts[0].includes("; ")) {
      const i = parts[0].indexOf("; ");
      parts = [parts[0].slice(0, i).trim(), parts[0].slice(i + 2).trim()];
    }
    const department = trailingPart(parts) || NONE;
    const state = parts.length >= 2 ? parts[0] || NONE : NONE;
    const key = `${state}|${department}`;
    const cur = byKey.get(key);
    if (cur) cur.total += row.total;
    else byKey.set(key, { state, department, total: row.total });
  }
  return [...byKey.values()];
}

/** Elementwise sum of two arrays (pads the shorter with zeros). */
function addInto(target: number[], add: number[]): number[] {
  const n = Math.max(target.length, add.length);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = (target[i] ?? 0) + (add[i] ?? 0);
  return out;
}

/**
 * Bucket a daily series into `weeks` trailing weekly sums (chronological order).
 * Groups from the END so the most recent week is always whole; left-pads with
 * zeros when the series is shorter than `weeks`.
 */
export function bucketDailyToWeekly(daily: number[], weeks: number): number[] {
  const buckets: number[] = [];
  for (let end = daily.length; end > 0; end -= 7) {
    buckets.push(sum(daily.slice(Math.max(0, end - 7), end)));
  }
  buckets.reverse();
  const tail = buckets.slice(-weeks);
  while (tail.length < weeks) tail.unshift(0);
  return tail;
}

/**
 * Per-(state,department) weekly series from a daily-interval [State,Department]
 * response. Mirrors aggregateStateDept's label-splitting but preserves the
 * series, bucketed into `weeks` trailing weekly sums. Keyed `state|department`.
 */
export function aggregateStateDeptWeekly(
  parsed: ParsedSeries[],
  weeks = 12,
): Map<string, number[]> {
  const byKey = new Map<string, number[]>();
  for (const row of parsed) {
    let parts = row.parts.map((p) => p.trim());
    if (parts.length === 1 && parts[0].includes("; ")) {
      const i = parts[0].indexOf("; ");
      parts = [parts[0].slice(0, i).trim(), parts[0].slice(i + 2).trim()];
    }
    const department = trailingPart(parts) || NONE;
    const state = parts.length >= 2 ? parts[0] || NONE : NONE;
    if (department === NONE || state === NONE) continue;
    const key = `${state}|${department}`;
    const weekly = bucketDailyToWeekly(row.series, weeks);
    const cur = byKey.get(key);
    byKey.set(key, cur ? addInto(cur, weekly) : weekly);
  }
  return byKey;
}

export interface TrendPoint {
  month: string; // "YYYY-MM"
  value: number;
}
export interface TrendSeries {
  event: string;
  points: TrendPoint[];
}
export interface TrendsResponse {
  series: TrendSeries[];
  window: number; // days covered (~180)
}

/**
 * Sum a daily series into trailing calendar-month buckets, keyed "YYYY-MM".
 * `xValues` are the Amplitude date labels ("YYYY-MM-DD") aligned 1:1 with
 * `daily`. Returns the last `months` months, chronological. Empty on any
 * length mismatch (defensive — a malformed response yields no trend, not a
 * crash or a wrong read).
 */
export function bucketDailyToMonthly(daily: number[], xValues: string[], months = 6): TrendPoint[] {
  if (daily.length === 0 || daily.length !== xValues.length) return [];
  const byMonth = new Map<string, number>();
  for (let i = 0; i < daily.length; i++) {
    const month = xValues[i].slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + (Number(daily[i]) || 0));
  }
  const ordered = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, value]) => ({ month, value }));
  return ordered.slice(-months);
}
