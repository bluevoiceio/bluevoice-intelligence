"use client";

import { useMemo } from "react";

import { lorenzPoints, sumByState, topShare } from "@/lib/charts";
import { SIGNAL } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmtPct } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

const W = 320;
const H = 200;
const PAD = 24;

export function ConcentrationCurve({ accounts }: { accounts: AccountIntelligence[] }) {
  const { path, top5 } = useMemo(() => {
    const stateVals = sumByState(accounts).map((s) => s.value);
    const pts = lorenzPoints(stateVals);
    const path = pts
      .map((p, i) => {
        const x = PAD + p.x * (W - 2 * PAD);
        const y = H - PAD - p.y * (H - 2 * PAD);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { path, top5: topShare(stateVals, 5) };
  }, [accounts]);

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Volume concentration — states
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Volume concentration curve">
          {/* axes */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
          {/* line of perfect equality */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={PAD} stroke="currentColor" strokeDasharray="3 3" opacity={0.25} />
          {/* the Lorenz curve */}
          <path d={path} fill="none" stroke={SIGNAL} strokeWidth={2.5} />
          <text x={W - PAD} y={PAD - 6} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.7}>
            top 5 states = {fmtPct(top5)}
          </text>
        </svg>
      </CardContent>
    </Card>
  );
}
