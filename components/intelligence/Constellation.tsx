"use client";

import { useMemo } from "react";

import type { AccountIntelligence } from "@/lib/intelligence";
import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";

const W = 1000;
const H = 320;
const PAD = 28;
const CENTER = H / 2;

const xScale = (composite: number) => PAD + (composite / 100) * (W - 2 * PAD);

/**
 * Beeswarm of the whole book on the composite-health axis: every account is a
 * dot placed at its score, sized by question volume, colored by band. The
 * at-risk cluster piles up on the left. Click a dot to focus that account.
 */
export function Constellation({
  accounts,
  activeKey,
  onSelect,
  onHover,
}: {
  accounts: AccountIntelligence[];
  activeKey: string | null;
  onSelect: (a: AccountIntelligence) => void;
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const points = useMemo(() => {
    const maxVol = Math.max(1, ...accounts.map((a) => a.current));
    const rOf = (v: number) => 3 + Math.sqrt(v / maxVol) * 5.5;

    // Column-bucket beeswarm: group by x, stack center-out within each column.
    const buckets = new Map<number, AccountIntelligence[]>();
    for (const a of accounts) {
      const b = Math.round(xScale(a.composite) / 14);
      (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(a);
    }
    const out: { a: AccountIntelligence; x: number; y: number; r: number }[] = [];
    for (const [b, list] of buckets) {
      list.sort((p, q) => q.current - p.current); // big dots toward the center line
      const x = b * 14;
      list.forEach((a, i) => {
        const slot = Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1);
        const r = rOf(a.current);
        const y = Math.max(PAD, Math.min(H - PAD, CENTER + slot * 13));
        out.push({ a, x, y, r });
      });
    }
    return out;
  }, [accounts]);

  const keyOf = (a: AccountIntelligence) => `${a.usps}|${a.department}`;

  return (
    <Card>
      <CardContent className="pt-6">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Account health beeswarm">
          {/* band zones */}
          {([
            ["red", 0, 40],
            ["yellow", 40, 75],
            ["green", 75, 100],
          ] as const).map(([band, lo, hi]) => (
            <rect
              key={band}
              x={xScale(lo)}
              y={PAD - 8}
              width={xScale(hi) - xScale(lo)}
              height={H - 2 * (PAD - 8)}
              fill={bandColor(band).soft}
            />
          ))}
          {/* dividers + axis labels */}
          {[0, 40, 75, 100].map((t) => (
            <line key={t} x1={xScale(t)} y1={PAD - 8} x2={xScale(t)} y2={H - PAD + 8} className="stroke-border" strokeWidth={1} />
          ))}
          <text x={xScale(0)} y={H - 4} className="fill-muted-foreground" fontSize={11}>
            0 · At risk
          </text>
          <text x={xScale(100)} y={H - 4} textAnchor="end" className="fill-muted-foreground" fontSize={11}>
            Healthy · 100
          </text>

          {/* dots */}
          {points.map(({ a, x, y, r }) => {
            const c = bandColor(a.band);
            const active = keyOf(a) === activeKey;
            return (
              <g
                key={keyOf(a)}
                className="cursor-pointer"
                onClick={() => onSelect(a)}
                onMouseEnter={(e) => onHover?.(a, e)}
                onMouseMove={(e) => onHover?.(a, e)}
                onMouseLeave={() => onHover?.(null)}
              >
                {a.band === "red" ? (
                  <circle cx={x} cy={y} r={r + 2.5} fill={c.glow} opacity={0.5} />
                ) : null}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={c.solid}
                  fillOpacity={active ? 1 : 0.85}
                  stroke={active ? "currentColor" : c.solid}
                  strokeWidth={active ? 2 : 0}
                  className={active ? "text-foreground" : undefined}
                />
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
