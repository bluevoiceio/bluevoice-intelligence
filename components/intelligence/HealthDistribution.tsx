"use client";

import { useMemo } from "react";

import { histogramBuckets } from "@/lib/charts";
import { compositeRamp } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountIntelligence } from "@/lib/intelligence";

const W = 320;
const H = 200;
const PAD = 20;

export function HealthDistribution({ accounts }: { accounts: AccountIntelligence[] }) {
  const buckets = useMemo(() => histogramBuckets(accounts.map((a) => a.composite), 10), [accounts]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const bw = (W - 2 * PAD) / buckets.length;

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Health distribution — tail → head
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Health score distribution">
          {buckets.map((b, i) => {
            const h = (b.count / max) * (H - 2 * PAD);
            return (
              <rect
                key={b.lo}
                x={PAD + i * bw + 1}
                y={H - PAD - h}
                width={bw - 2}
                height={h}
                rx={2}
                fill={compositeRamp((b.lo + b.hi) / 2)}
                opacity={0.85}
              />
            );
          })}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
        </svg>
      </CardContent>
    </Card>
  );
}
