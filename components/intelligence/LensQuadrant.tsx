"use client";

import { useMemo } from "react";

import type { AccountIntelligence } from "@/lib/intelligence";
import { bandColor } from "@/components/intelligence/lens";

const W = 720;
const H = 520;
const PAD = { l: 54, r: 24, t: 24, b: 48 };
const innerW = W - PAD.l - PAD.r;
const innerH = H - PAD.t - PAD.b;

const xOf = (breadth: number) => PAD.l + (breadth / 100) * innerW;
const yOf = (momentum: number) => PAD.t + (1 - momentum / 100) * innerH;

const QUADRANTS = [
  { x: 0.5, y: 0, label: "Champions — expand", align: "end" as const },
  { x: 0, y: 0, label: "Growing — broaden", align: "start" as const },
  { x: 0.5, y: 0.5, label: "Entrenched — defend", align: "end" as const },
  { x: 0, y: 0.5, label: "Rescue — at risk", align: "start" as const },
];

/**
 * The strategic map: every account placed by Breadth (x, pillar adoption) and
 * Momentum (y, usage trend), sized by question volume, colored by composite. The
 * four quadrants name the play — rescue the low/low at-risk, broaden the
 * high-momentum/low-breadth, expand the champions. Tells the "what to do" story.
 */
export function LensQuadrant({
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
  const keyOf = (a: AccountIntelligence) => `${a.usps}|${a.department}`;
  const points = useMemo(() => {
    const maxVol = Math.max(1, ...accounts.map((a) => a.current));
    return accounts
      .filter((a) => a.lenses.breadth != null)
      .map((a) => ({
        a,
        cx: xOf(a.lenses.breadth as number),
        cy: yOf(a.lenses.momentum),
        r: 4 + Math.sqrt(a.current / maxVol) * 16,
      }))
      .sort((p, q) => q.r - p.r); // big bubbles behind
  }, [accounts]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Breadth versus momentum quadrant">
      {/* quadrant wash — at-risk corner tinted */}
      <rect x={PAD.l} y={PAD.t + innerH / 2} width={innerW / 2} height={innerH / 2} fill={bandColor("red").soft} />
      <rect x={xOf(50)} y={PAD.t} width={innerW / 2} height={innerH / 2} fill={bandColor("green").soft} />

      {/* mid gridlines */}
      <line x1={xOf(50)} y1={PAD.t} x2={xOf(50)} y2={PAD.t + innerH} className="stroke-border" strokeDasharray="4 4" />
      <line x1={PAD.l} y1={yOf(50)} x2={PAD.l + innerW} y2={yOf(50)} className="stroke-border" strokeDasharray="4 4" />

      {/* frame */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH} className="stroke-border" />
      <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} className="stroke-border" />

      {/* quadrant labels */}
      {QUADRANTS.map((q) => (
        <text
          key={q.label}
          x={PAD.l + q.x * innerW + (q.align === "end" ? innerW / 2 - 10 : 10)}
          y={PAD.t + q.y * innerH + 20}
          textAnchor={q.align}
          className="fill-muted-foreground"
          fontSize={11}
          fontWeight={500}
        >
          {q.label}
        </text>
      ))}

      {/* axis labels */}
      <text x={PAD.l + innerW / 2} y={H - 14} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
        Breadth — pillar adoption →
      </text>
      <text transform={`translate(16 ${PAD.t + innerH / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
        Momentum — usage trend →
      </text>

      {/* bubbles */}
      {points.map(({ a, cx, cy, r }) => {
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
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={c.solid}
              fillOpacity={active ? 0.95 : 0.55}
              stroke={active ? "currentColor" : c.solid}
              strokeWidth={active ? 2 : 0.75}
              className={active ? "text-foreground" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
