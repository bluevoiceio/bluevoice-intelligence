"use client";

import { sparklinePath } from "@/lib/charts";
import { ACCENT } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { TrendSeries } from "@/lib/amplitude-parse";

const SW = 120;
const SH = 30;

/** Returns null when trend data is absent — the panel simply doesn't render,
 *  so a failed /api/trends never breaks the briefing. */
export function AdoptionTrend({ series }: { series?: TrendSeries[] }) {
  if (!series || series.length === 0) return null;

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Premium adoption — 6 months
        </p>
        <div className="flex flex-col gap-2.5">
          {series.map((s) => {
            const values = s.points.map((p) => p.value);
            const last = values[values.length - 1] ?? 0;
            const first = values.find((v) => v > 0) ?? 0;
            const ratio = first > 0 ? last / first : 0;
            const rising = last > first;
            return (
              <div key={s.event} className="rounded-lg border p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium">{s.event.replace(/ (Sent|Successfully|Created|Filled Successfully)$/, "")}</span>
                  <span className="text-xs font-semibold tabular-nums">{fmt(last)}</span>
                </div>
                <svg viewBox={`0 0 ${SW} ${SH}`} width="100%" height={26} preserveAspectRatio="none" className="mt-1">
                  <polyline points={sparklinePath(values, SW, SH)} fill="none" stroke={rising ? ACCENT.signal : "currentColor"} strokeWidth={2} opacity={rising ? 1 : 0.5} />
                </svg>
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {ratio >= 1.5 ? `▲ ${Math.round(ratio)}× · rising` : rising ? "▲ climbing" : "▬ flat"}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
