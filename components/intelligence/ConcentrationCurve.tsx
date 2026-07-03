"use client";

import { useMemo } from "react";

import { sumByState, topShare } from "@/lib/charts";
import { SIGNAL } from "@/components/intelligence/lens";
import { useMeasure } from "@/components/intelligence/useMeasure";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPct } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

const H = 260;
const PAD = { top: 18, right: 16, bottom: 30, left: 38 };

/**
 * Volume concentration — a Lorenz curve over states (largest first). The further
 * the blue curve bows above the grey line of equality, the more lopsided the
 * book. Plain-English readouts quantify it; hover a point to see the cumulative
 * share through the top-N states.
 */
export function ConcentrationCurve({ accounts }: { accounts: AccountIntelligence[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();

  const { pts, top5, topState, halfN, n } = useMemo(() => {
    const states = sumByState(accounts);
    const values = states.map((s) => s.value);
    const total = values.reduce((s, v) => s + v, 0) || 1;
    const n = states.length;
    let cum = 0;
    const pts = [{ x: 0, y: 0, label: "", i: 0 }];
    states.forEach((s, i) => {
      cum += s.value;
      pts.push({ x: (i + 1) / n, y: cum / total, label: s.state, i: i + 1 });
    });
    const halfIdx = pts.findIndex((p) => p.y >= 0.5);
    return { pts, top5: topShare(values, 5), topState: (states[0]?.value ?? 0) / total, halfN: halfIdx > 0 ? halfIdx : n, n };
  }, [accounts]);

  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const px = (x: number) => PAD.left + x * innerW;
  const py = (y: number) => PAD.top + (1 - y) * innerH;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${px(1).toFixed(1)},${py(0).toFixed(1)} Z`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volume concentration</CardTitle>
        <CardDescription>
          Questions by state, largest first. The more the curve bows above the line of equality, the more the book leans on a
          few states.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1">
          <Stat value={fmtPct(top5)} label="in the top 5 states" />
          <Stat value={fmtPct(topState)} label="in the single largest" />
          <Stat value={`${halfN}`} label={`state${halfN === 1 ? "" : "s"} hold half the volume`} />
        </div>
        <div ref={ref} className="w-full">
          {width > 0 ? (
            <svg width={width} height={H} className="block" role="img" aria-label="Volume concentration curve">
              {/* axes */}
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.2} />
              <line x1={PAD.left} y1={H - PAD.bottom} x2={width - PAD.right} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.2} />
              {/* line of equality */}
              <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="currentColor" strokeDasharray="4 4" strokeOpacity={0.3} />
              {/* concentration area + curve */}
              <path d={area} fill={SIGNAL} fillOpacity={0.08} />
              <path d={line} fill="none" stroke={SIGNAL} strokeWidth={2.5} strokeLinejoin="round" />
              {/* markers at each state (hover for cumulative share) */}
              {pts.slice(1).map((p) => (
                <circle key={p.i} cx={px(p.x)} cy={py(p.y)} r={2} fill={SIGNAL} fillOpacity={0.7}>
                  <title>{`Top ${p.i} of ${n} states = ${fmtPct(p.y)} of volume (through ${p.label})`}</title>
                </circle>
              ))}
              {/* axis labels */}
              <text x={PAD.left} y={H - 8} fontSize={9} className="fill-muted-foreground">fewest</text>
              <text x={width - PAD.right} y={H - 8} textAnchor="end" fontSize={9} className="fill-muted-foreground">← states, largest first</text>
              <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize={9} className="fill-muted-foreground">100%</text>
              <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" fontSize={9} className="fill-muted-foreground">0</text>
            </svg>
          ) : (
            <div className="h-[260px] w-full animate-pulse rounded-lg bg-muted/40" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xl font-semibold tabular-nums" style={{ color: SIGNAL }}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}
