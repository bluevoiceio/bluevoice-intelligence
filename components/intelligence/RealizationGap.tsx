"use client";

import { useMemo, useState } from "react";

import { funnelBars } from "@/lib/charts";
import { ACCENT, bandColor } from "@/components/intelligence/lens";
import { ChartTooltip, type Tip } from "@/components/intelligence/ChartTooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, fmtPct } from "@/lib/format";
import type { FeatureTotals } from "@/lib/intelligence";

/** The AI-differentiated premium surfaces — the runway. Everything else is the
 *  "basics" (ask / read / sign off) officers already lean on. */
const PREMIUM = new Set(["workspace", "formsEmailed", "aiFormsFilled", "artifactsExported", "redaction"]);

export function RealizationGap({ totals }: { totals?: FeatureTotals }) {
  const bars = useMemo(() => (totals ? funnelBars(totals) : []), [totals]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  if (bars.length === 0 || !totals) return null;

  const questions = totals.questions || 1;
  const firstPremiumIdx = bars.findIndex((b) => PREMIUM.has(b.key));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>The realization gap</CardTitle>
          <CardDescription>
            Book-wide feature use this window. Officers lean hard on the basics — asking, reading, signing off — but the
            AI-differentiated premium surfaces (the runway) drop off a cliff. Hover a bar for the ratio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1" onMouseLeave={() => { setHoverKey(null); setTip(null); }}>
          {bars.map((b, i) => {
            const premium = PREMIUM.has(b.key);
            const color = premium ? ACCENT.value : ACCENT.signal;
            const shareOfQ = b.key === "questions" ? null : b.value / questions;
            const isHover = hoverKey === b.key;
            const content = (
              <div>
                <div className="font-semibold">{b.label}</div>
                <div className="tabular-nums">{fmt(b.value)} this window</div>
                {shareOfQ != null ? (
                  <div className="text-muted-foreground">
                    {fmtPct(shareOfQ)} of ask volume
                    {b.value > 0 && b.value < questions ? ` · ~1 per ${fmt(Math.round(questions / b.value))} asks` : ""}
                  </div>
                ) : (
                  <div className="text-muted-foreground">the ask baseline</div>
                )}
              </div>
            );
            return (
              <div key={b.key}>
                {i === firstPremiumIdx && firstPremiumIdx > 0 ? (
                  <div className="my-1.5 flex items-center gap-2">
                    <span className="h-px flex-1" style={{ background: bandColor("red").glow }} />
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: bandColor("red").solid }}>
                      ↓ the AI edge
                    </span>
                    <span className="h-px flex-1" style={{ background: bandColor("red").glow }} />
                  </div>
                ) : null}
                <div
                  className="grid cursor-default grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-md px-1 py-1 transition-colors"
                  style={{ background: isHover ? "var(--accent)" : undefined }}
                  onMouseMove={(e) => { setHoverKey(b.key); setTip({ x: e.clientX, y: e.clientY, content }); }}
                >
                  <span className="truncate text-right text-[12px] font-medium text-muted-foreground">{b.label}</span>
                  <div className="relative h-5">
                    <div
                      className="absolute inset-y-0 left-0 rounded-[3px] transition-[width]"
                      style={{ width: `${Math.max(b.frac * 100, 0.5)}%`, background: color, opacity: isHover ? 1 : 0.9 }}
                    />
                  </div>
                  <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                    <span className="text-[13px] font-semibold" style={{ color: premium ? color : undefined }}>{fmt(b.value)}</span>
                    {shareOfQ != null ? (
                      <span className="w-16 text-right text-[10px] text-muted-foreground">{fmtPct(shareOfQ)} of asks</span>
                    ) : (
                      <span className="w-16 text-right text-[10px] text-muted-foreground">the baseline</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <ChartTooltip tip={tip} />
    </>
  );
}
