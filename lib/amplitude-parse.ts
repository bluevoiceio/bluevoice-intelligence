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
 * the trailing part). parts[0] is the State; the trailing part is the
 * Department. Series with a single part have no State → "(none)".
 */
export function aggregateStateDept(parsed: ParsedSeries[]): StateDeptTotal[] {
  const byKey = new Map<string, StateDeptTotal>();
  for (const row of parsed) {
    const parts = row.parts.map((p) => p.trim());
    const department = trailingPart(parts) || NONE;
    const state = parts.length >= 2 ? parts[0] || NONE : NONE;
    const key = `${state}|${department}`;
    const cur = byKey.get(key);
    if (cur) cur.total += row.total;
    else byKey.set(key, { state, department, total: row.total });
  }
  return [...byKey.values()];
}
