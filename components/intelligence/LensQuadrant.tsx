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
  { key: "champions", x: 0.5, y: 0, label: "Champions — expand", align: "end" as const },
  { key: "growing", x: 0, y: 0, label: "Growing — broaden", align: "start" as const },
  { key: "entrenched", x: 0.5, y: 0.5, label: "Entrenched — defend", align: "end" as const },
  { key: "rescue", x: 0, y: 0.5, label: "Rescue — at risk", align: "start" as const },
] as const;

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
  const { points, counts } = useMemo(() => {
    const placed = accounts.filter((a) => a.lenses.breadth != null);
    const maxVol = Math.max(1, ...placed.map((a) => a.current));
    // Size is DEMOTED to a narrow 3–6.5px range: area is the least-accurate
    // quantitative encoding (Cleveland & McGill; Stevens' power law), so volume
    // only nudges the radius — position (adoption × trend) carries the meaning,
    // and the precise volume lives in the hover card.
    const points = placed
      .map((a) => ({
        a,
        cx: xOf(a.lenses.breadth as number),
        cy: yOf(a.lenses.momentum),
        r: 3 + Math.sqrt(a.current / maxVol) * 3.5,
      }))
      .sort((p, q) => q.r - p.r); // larger marks behind

    const counts = { champions: 0, growing: 0, entrenched: 0, rescue: 0 };
    for (const a of placed) {
      const broad = (a.lenses.breadth as number) >= 50;
      const rising = a.lenses.momentum >= 50;
      if (broad && rising) counts.champions++;
      else if (!broad && rising) counts.growing++;
      else if (broad && !rising) counts.entrenched++;
      else counts.rescue++;
    }
    return { points, counts };
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

      {/* quadrant labels with live counts; Rescue is the single highlighted
          focus (one emphasis beats four — Few; Ajani et al.) */}
      {QUADRANTS.map((q) => {
        const focus = q.key === "rescue";
        return (
          <text
            key={q.key}
            x={PAD.l + q.x * innerW + (q.align === "end" ? innerW / 2 - 10 : 10)}
            y={PAD.t + q.y * innerH + 20}
            textAnchor={q.align}
            className={focus ? undefined : "fill-muted-foreground"}
            fill={focus ? bandColor("red").solid : undefined}
            fontSize={11}
            fontWeight={focus ? 600 : 500}
          >
            {q.label} · {counts[q.key]}
          </text>
        );
      })}

      {/* axis labels */}
      <text x={PAD.l + innerW / 2} y={H - 14} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
        Feature adoption →
      </text>
      <text transform={`translate(16 ${PAD.t + innerH / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
        Usage trend →
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
              r={active ? r + 2 : r}
              fill={c.solid}
              fillOpacity={active ? 0.95 : 0.5}
              stroke={active ? "currentColor" : c.solid}
              strokeWidth={active ? 2 : 0.5}
              className={active ? "text-foreground" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
