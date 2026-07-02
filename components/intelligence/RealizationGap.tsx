"use client";

import { useMemo } from "react";

import { funnelBars } from "@/lib/charts";
import { ACCENT, bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { FeatureTotals } from "@/lib/intelligence";

/** Features below this share of the max are the "AI-differentiated cliff". */
const CLIFF_FRAC = 0.05;

export function RealizationGap({ totals }: { totals?: FeatureTotals }) {
  const bars = useMemo(() => (totals ? funnelBars(totals) : []), [totals]);
  if (bars.length === 0) return null;

  return (
    <Card className="flex-[1.3]">
      <CardContent className="p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          The realization gap — feature use, this window
        </p>
        <div className="flex flex-col gap-1.5">
          {bars.map((b) => {
            const belowCliff = b.frac < CLIFF_FRAC;
            const color = belowCliff ? bandColor("red").solid : ACCENT.signal;
            return (
              <div key={b.key} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">{b.label}</span>
                <div className="relative h-4 flex-1">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{ width: `${Math.max(b.frac * 100, 0.6)}%`, background: color, opacity: belowCliff ? 1 : 0.85 }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] font-medium tabular-nums" style={{ color: belowCliff ? bandColor("red").solid : undefined }}>
                  {fmt(b.value)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
          Heavy on the basics; the AI-differentiated features (red) are the runway.
        </p>
      </CardContent>
    </Card>
  );
}
