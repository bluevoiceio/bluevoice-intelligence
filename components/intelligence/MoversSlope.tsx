"use client";

import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import type { Mover } from "@/lib/charts";

const W = 320;
const H = 200;

/** Diverging bars: risers (green, right) and fallers (red, left) by MoM %. */
export function MoversSlope({ movers }: { movers: { risers: Mover[]; fallers: Mover[] } }) {
  const rows = [
    ...movers.fallers.map((m) => ({ ...m, up: false })),
    ...movers.risers.map((m) => ({ ...m, up: true })),
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.deltaPct)));
  const mid = W / 2;
  const barH = 18;

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Biggest movers — MoM %
        </p>
        <svg viewBox={`0 0 ${W} ${Math.max(H, rows.length * (barH + 8) + 12)}`} width="100%" role="img" aria-label="Biggest movers">
          <line x1={mid} y1={0} x2={mid} y2="100%" stroke="currentColor" opacity={0.15} />
          {rows.map((r, i) => {
            const y = 8 + i * (barH + 8);
            const len = (Math.abs(r.deltaPct) / max) * (mid - 60);
            const color = bandColor(r.up ? "green" : "red").solid;
            return (
              <g key={`${r.usps}-${r.department}`}>
                <rect x={r.up ? mid : mid - len} y={y} width={len} height={barH} rx={3} fill={color} opacity={0.85} />
                <text x={r.up ? mid + len + 5 : mid - len - 5} y={y + barH / 2 + 3} textAnchor={r.up ? "start" : "end"} fontSize={10} fill="currentColor">
                  {r.department} {r.deltaPct > 0 ? "+" : "−"}{Math.abs(Math.round(r.deltaPct))}%
                </text>
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
