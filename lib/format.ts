const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en-US");

/** 17702 → "17,702" */
export function fmt(n: number): string {
  return full.format(n);
}

/** 17702 → "17.7K" (for tight KPI labels / axis ticks) */
export function fmtCompact(n: number): string {
  return compact.format(n);
}

/** 0.61 → "61%" */
export function fmtPct(fraction: number): string {
  if (!isFinite(fraction)) return "—";
  return `${Math.round(fraction * 100)}%`;
}

/** "2026-03-28" → "Mar 28" */
export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}
