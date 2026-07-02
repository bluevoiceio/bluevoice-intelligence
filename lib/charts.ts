import type { AccountIntelligence, FeatureTotals } from "@/lib/intelligence";

/** Pure chart-data transforms for the briefing's bespoke SVG charts. No React,
 *  no DOM, no I/O — unit tested in lib/__tests__/charts.test.ts. */

export interface Mover {
  department: string;
  usps: string;
  deltaPct: number;
}

/** Sum `current` by state, descending — feeds the concentration curve + Act 1 copy. */
export function sumByState(accounts: Pick<AccountIntelligence, "state" | "current">[]): { state: string; value: number }[] {
  const by = new Map<string, number>();
  for (const a of accounts) by.set(a.state, (by.get(a.state) ?? 0) + a.current);
  return [...by.entries()].map(([state, value]) => ({ state, value })).sort((p, q) => q.value - p.value);
}

/** Share of the grand total held by the k largest values (0–1). */
export function topShare(values: number[], k: number): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, k).reduce((s, v) => s + v, 0);
  return top / total;
}

/** Lorenz curve points (x = cumulative share of accounts, y = cumulative share
 *  of volume), sorted so the largest contributor comes first — the curve bows
 *  toward the top-left as concentration rises. Includes the (0,0) origin. */
export function lorenzPoints(values: number[]): { x: number; y: number }[] {
  const sorted = [...values].sort((a, b) => b - a);
  const total = sorted.reduce((s, v) => s + v, 0);
  const n = sorted.length;
  const pts = [{ x: 0, y: 0 }];
  if (n === 0 || total <= 0) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  let cum = 0;
  sorted.forEach((v, i) => {
    cum += v;
    pts.push({ x: (i + 1) / n, y: cum / total });
  });
  return pts;
}

/** Fixed-width histogram over the 0–100 composite scale. */
export function histogramBuckets(values: number[], width = 10): { lo: number; hi: number; count: number }[] {
  const bins = Math.ceil(100 / width);
  const buckets = Array.from({ length: bins }, (_, i) => ({ lo: i * width, hi: (i + 1) * width, count: 0 }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(v / width)));
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Biggest risers and fallers by month-over-month % delta (nulls excluded). */
export function topMovers(accounts: AccountIntelligence[], n = 3): { risers: Mover[]; fallers: Mover[] } {
  const withDelta = accounts.filter((a): a is AccountIntelligence & { deltaPct: number } => a.deltaPct != null);
  const toMover = (a: AccountIntelligence & { deltaPct: number }): Mover => ({ department: a.department, usps: a.usps, deltaPct: a.deltaPct });
  const risers = withDelta.filter((a) => a.deltaPct > 0).sort((x, y) => y.deltaPct - x.deltaPct).slice(0, n).map(toMover);
  const fallers = withDelta.filter((a) => a.deltaPct < 0).sort((x, y) => x.deltaPct - y.deltaPct).slice(0, n).map(toMover);
  return { risers, fallers };
}

const FUNNEL_ORDER: { key: keyof FeatureTotals; label: string }[] = [
  { key: "documents", label: "PDF Loaded" },
  { key: "questions", label: "Questions" },
  { key: "signoffs", label: "Signoffs" },
  { key: "workspace", label: "Workspace" },
  { key: "formsEmailed", label: "Form Emailed" },
  { key: "aiFormsFilled", label: "AI Forms" },
  { key: "artifactsExported", label: "Exported" },
  { key: "redaction", label: "Redaction" },
];

/** Feature totals as descending funnel bars; `frac` is relative to the max. */
export function funnelBars(t: FeatureTotals): { key: string; label: string; value: number; frac: number }[] {
  const rows = FUNNEL_ORDER.map(({ key, label }) => ({ key: String(key), label, value: t[key] }));
  rows.sort((a, b) => b.value - a.value);
  const max = rows[0]?.value || 1;
  return rows.map((r) => ({ ...r, frac: r.value / max }));
}

/** SVG polyline `points` for a sparkline, normalized per-series into a w×h box
 *  (min → bottom, max → top). Flat series render as a mid-line. */
export function sparklinePath(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const fmt = (n: number) => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
  return values
    .map((v, i) => {
      const y = max === min ? h / 2 : h - ((v - min) / span) * h;
      return `${fmt(i * step)},${fmt(y)}`;
    })
    .join(" ");
}
