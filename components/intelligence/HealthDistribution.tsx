"use client";

import { useMemo, useState } from "react";
import { scaleLinear, scaleSqrt } from "d3-scale";

import { BAND_BREAKS, bandFor, type AccountIntelligence } from "@/lib/intelligence";
import { bandColor, compositeRamp } from "@/components/intelligence/lens";
import { useMeasure } from "@/components/intelligence/useMeasure";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const H = 300;
const PAD = { top: 16, right: 20, bottom: 34, left: 20 };
const DOT = 11; // horizontal bin + vertical stack spacing

/**
 * Health distribution — a beeswarm where every department is a dot placed by its
 * 0–100 score (the most accurate encoding), sized by question volume, over
 * red/amber/green band zones. Tall stacks read as density (the shape of the
 * book), and every dot is live: hover for its signature. Restores the
 * interactivity of the retired Constellation with a truthful x-position.
 */
export function HealthDistribution({
  accounts,
  onHover,
}: {
  accounts: AccountIntelligence[];
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const { dots, midY, x } = useMemo(() => {
    const x = scaleLinear().domain([0, 100]).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]);
    const vols = accounts.map((a) => a.current);
    const r = scaleSqrt().domain([0, Math.max(1, ...vols)]).range([2.5, 6.5]);
    const midY = PAD.top + (H - PAD.top - PAD.bottom) / 2;

    const sorted = [...accounts].sort((a, b) => a.composite - b.composite);
    const bins = new Map<number, number>();
    const dots = sorted.map((a) => {
      const cx = x(a.composite);
      const bin = Math.round(cx / DOT);
      const n = bins.get(bin) ?? 0;
      bins.set(bin, n + 1);
      const row = Math.ceil(n / 2);
      const sign = n % 2 === 1 ? -1 : 1;
      return { a, cx, cy: midY + sign * row * DOT, r: r(a.current), key: `${a.usps}-${a.department}` };
    });
    return { dots, midY, x };
  }, [accounts, width]);

  const breaks = [
    { at: 0, label: "0" },
    { at: BAND_BREAKS.yellow, label: `${BAND_BREAKS.yellow}` },
    { at: BAND_BREAKS.green, label: `${BAND_BREAKS.green}` },
    { at: 100, label: "100" },
  ];
  const zones: Array<{ band: "red" | "yellow" | "green"; lo: number; hi: number; label: string }> = [
    { band: "red", lo: 0, hi: BAND_BREAKS.yellow, label: "At risk" },
    { band: "yellow", lo: BAND_BREAKS.yellow, hi: BAND_BREAKS.green, label: "Watch" },
    { band: "green", lo: BAND_BREAKS.green, hi: 100, label: "Healthy" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health distribution</CardTitle>
        <CardDescription>
          Every department by health score — the at-risk tail on the left, the healthy head on the right. Dot size is question volume; hover for its signature.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="w-full">
          {width > 0 ? (
            <svg width={width} height={H} className="block" onMouseLeave={() => { setHoverKey(null); onHover?.(null); }}>
              {/* band zones */}
              {zones.map((z) => {
                const zx = x(z.lo);
                const zw = x(z.hi) - zx;
                const c = bandColor(z.band);
                return (
                  <g key={z.band}>
                    <rect x={zx} y={PAD.top} width={zw} height={H - PAD.top - PAD.bottom} fill={c.soft} />
                    <text x={zx + zw / 2} y={H - 8} textAnchor="middle" fontSize={10} fontWeight={600} fill={c.solid} opacity={0.8}>
                      {z.label}
                    </text>
                  </g>
                );
              })}
              {/* band break guides + ticks */}
              {breaks.map((b) => (
                <g key={b.at}>
                  <line x1={x(b.at)} y1={PAD.top} x2={x(b.at)} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.12} strokeDasharray={b.at === 0 || b.at === 100 ? undefined : "3 3"} />
                  <text x={x(b.at)} y={H - PAD.bottom + 13} textAnchor="middle" fontSize={9} className="fill-muted-foreground">{b.label}</text>
                </g>
              ))}
              {/* dots */}
              {dots.map((d) => {
                const isHover = hoverKey === d.key;
                return (
                  <circle
                    key={d.key}
                    cx={d.cx}
                    cy={d.cy}
                    r={isHover ? d.r + 2 : d.r}
                    fill={compositeRamp(d.a.composite)}
                    stroke={isHover ? "currentColor" : "rgba(255,255,255,0.5)"}
                    strokeWidth={isHover ? 1.5 : 0.5}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => { setHoverKey(d.key); onHover?.(d.a, e); }}
                    onMouseMove={(e) => onHover?.(d.a, e)}
                  >
                    <title>{`${d.a.department} — ${d.a.composite}/100 · ${bandColor(bandFor(d.a.composite)).label}`}</title>
                  </circle>
                );
              })}
              <line x1={PAD.left} y1={midY} x2={width - PAD.right} y2={midY} stroke="currentColor" strokeOpacity={0.06} />
            </svg>
          ) : (
            <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted/40" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
