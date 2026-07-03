"use client";

import { useMemo, useState } from "react";

import { sumByState, topShare } from "@/lib/charts";
import { clamp, SIGNAL } from "@/components/intelligence/lens";
import { ChartTooltip, type Tip } from "@/components/intelligence/ChartTooltip";
import { useMeasure } from "@/components/intelligence/useMeasure";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPct } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

const H = 260;
const PAD = { top: 18, right: 16, bottom: 30, left: 38 };

/**
 * Volume concentration — a Lorenz curve over states (largest first). The further
 * the blue curve bows above the grey line of equality, the more lopsided the
 * book. Hover the curve to snap to the nearest state and read the cumulative
 * share through the top-N.
 */
export function ConcentrationCurve({ accounts }: { accounts: AccountIntelligence[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

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

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const fracX = clamp((relX - PAD.left) / innerW, 0, 1);
    const idx = clamp(Math.round(fracX * n), 1, n);
    const p = pts[idx];
    setHoverIdx(idx);
    setTip({
      x: e.clientX,
      y: e.clientY,
      content: (
        <div>
          <div className="font-semibold tabular-nums">Top {idx} of {n} states</div>
          <div className="tabular-nums">{fmtPct(p.y)} of all questions</div>
          <div className="text-muted-foreground">through {p.label}</div>
        </div>
      ),
    });
  };
  const onLeave = () => { setHoverIdx(null); setTip(null); };
  const hp = hoverIdx != null ? pts[hoverIdx] : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Volume concentration</CardTitle>
          <CardDescription>
            Questions by state, largest first. The more the curve bows above the line of equality, the more the book leans on a
            few states. Hover to read the cumulative share.
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
              <svg width={width} height={H} className="block cursor-crosshair" role="img" aria-label="Volume concentration curve" onMouseMove={onMove} onMouseLeave={onLeave}>
                <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.2} />
                <line x1={PAD.left} y1={H - PAD.bottom} x2={width - PAD.right} y2={H - PAD.bottom} stroke="currentColor" strokeOpacity={0.2} />
                <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="currentColor" strokeDasharray="4 4" strokeOpacity={0.3} />
                <path d={area} fill={SIGNAL} fillOpacity={0.08} />
                <path d={line} fill="none" stroke={SIGNAL} strokeWidth={2.5} strokeLinejoin="round" />
                {pts.slice(1).map((p) => (
                  <circle key={p.i} cx={px(p.x)} cy={py(p.y)} r={hoverIdx === p.i ? 4.5 : 2} fill={SIGNAL} fillOpacity={hoverIdx === p.i ? 1 : 0.7} />
                ))}
                {hp ? (
                  <g>
                    <line x1={PAD.left} y1={py(hp.y)} x2={px(hp.x)} y2={py(hp.y)} stroke={SIGNAL} strokeOpacity={0.4} strokeDasharray="3 3" />
                    <line x1={px(hp.x)} y1={H - PAD.bottom} x2={px(hp.x)} y2={py(hp.y)} stroke={SIGNAL} strokeOpacity={0.4} strokeDasharray="3 3" />
                  </g>
                ) : null}
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
      <ChartTooltip tip={tip} />
    </>
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
