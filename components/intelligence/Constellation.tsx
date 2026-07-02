"use client";

import { useMemo } from "react";

import { BAND_BREAKS, type AccountIntelligence } from "@/lib/intelligence";
import { bandColor, compositeRamp } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";

const W = 1000;
const H = 300;
const PAD = 28;

const HIST_TOP = 24; // tallest bar reaches here
const HIST_BASE = 168; // bars sit on this line
const STRIP_TOP = 184; // "rain" begins
const STRIP_BOT = 248; // …and ends
const AXIS_Y = 268;

const BIN = 4; // composite-score width per histogram bin → 25 bins
const NBINS = Math.round(100 / BIN);

const xScale = (composite: number) => PAD + (composite / 100) * (W - 2 * PAD);

/**
 * Stable pseudo-random vertical offset (0–1) for the strip "rain". Deterministic
 * on the account key so a re-render never reshuffles the dots — the legibility
 * trap that makes naive jitter/beeswarm plots untrustworthy (Correll 2023).
 */
function jitter(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * "The spread" as a RAINCLOUD: a histogram (top) shows the distribution SHAPE —
 * the long at-risk tail, the thin healthy head — while the strip below ("rain")
 * keeps every one of the ~216 accounts on the page as an individual, clickable
 * dot placed at its true composite score. Position (the most accurate visual
 * encoding) carries the score; band colour reinforces it; nothing relies on a
 * bee-swarm's meaningless vertical packing. Band zones read from BAND_BREAKS, so
 * the shaded wash and the dot colours can never drift apart.
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
  const keyOf = (a: AccountIntelligence) => `${a.usps}|${a.department}`;

  const { bars, dots, redCount } = useMemo(() => {
    // Histogram counts.
    const counts = new Array(NBINS).fill(0);
    for (const a of accounts) {
      const idx = Math.min(NBINS - 1, Math.floor(a.composite / BIN));
      counts[idx]++;
    }
    const maxCount = Math.max(1, ...counts);
    const bars = counts.map((c, i) => {
      const center = i * BIN + BIN / 2;
      const h = (c / maxCount) * (HIST_BASE - HIST_TOP);
      return { i, c, center, x: xScale(i * BIN), w: xScale(BIN) - xScale(0), h };
    });

    // Strip dots — uniform small marks; the datum is the x-position, not size.
    const dots = accounts.map((a) => {
      const key = keyOf(a);
      const x = xScale(a.composite);
      const y = STRIP_TOP + jitter(key) * (STRIP_BOT - STRIP_TOP);
      return { a, key, x, y };
    });

    const redCount = accounts.filter((a) => a.composite < BAND_BREAKS.yellow).length;
    return { bars, dots, redCount };
  }, [accounts]);

  // Band zones [lo, hi] from the single source of truth.
  const zones: Array<["red" | "yellow" | "green", number, number]> = [
    ["red", 0, BAND_BREAKS.yellow],
    ["yellow", BAND_BREAKS.yellow, BAND_BREAKS.green],
    ["green", BAND_BREAKS.green, 100],
  ];

  return (
    <Card>
      <CardContent className="pt-6">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Distribution of account health — histogram with an account-level strip">
          {/* band zones behind everything */}
          {zones.map(([band, lo, hi]) => (
            <rect key={band} x={xScale(lo)} y={HIST_TOP - 8} width={xScale(hi) - xScale(lo)} height={STRIP_BOT - HIST_TOP + 16} fill={bandColor(band).soft} />
          ))}

          {/* band dividers */}
          {[BAND_BREAKS.yellow, BAND_BREAKS.green].map((t) => (
            <line key={t} x1={xScale(t)} y1={HIST_TOP - 8} x2={xScale(t)} y2={STRIP_BOT + 8} className="stroke-border" strokeDasharray="3 4" />
          ))}

          {/* baseline under the histogram */}
          <line x1={PAD} y1={HIST_BASE} x2={W - PAD} y2={HIST_BASE} className="stroke-border" />

          {/* histogram bars — band-aligned hue via compositeRamp(bin center) */}
          {bars.map((b) =>
            b.c === 0 ? null : (
              <rect
                key={b.i}
                x={b.x + 1}
                y={HIST_BASE - b.h}
                width={Math.max(1, b.w - 2)}
                height={b.h}
                rx={1.5}
                fill={compositeRamp(b.center)}
                fillOpacity={0.9}
              />
            ),
          )}

          {/* strip "rain" — one clickable dot per account at its true score */}
          {dots.map(({ a, key, x, y }) => {
            const active = key === activeKey;
            const c = bandColor(a.band);
            return (
              <circle
                key={key}
                cx={x}
                cy={y}
                r={active ? 4.5 : 2.6}
                fill={c.solid}
                fillOpacity={active ? 1 : 0.62}
                stroke={active ? "currentColor" : "none"}
                strokeWidth={active ? 2 : 0}
                className={active ? "cursor-pointer text-foreground" : "cursor-pointer"}
                onClick={() => onSelect(a)}
                onMouseEnter={(e) => onHover?.(a, e)}
                onMouseMove={(e) => onHover?.(a, e)}
                onMouseLeave={() => onHover?.(null)}
              />
            );
          })}

          {/* focus annotation — one highlight + words on the at-risk tail
              (Ajani et al. 2022: focus made the takeaway 2.5–3× more memorable) */}
          {redCount > 0 ? (
            <g>
              <text x={xScale(BAND_BREAKS.yellow / 2)} y={HIST_TOP + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={bandColor("red").solid}>
                {redCount} to call
              </text>
              <line
                x1={xScale(BAND_BREAKS.yellow / 2)}
                y1={HIST_TOP + 10}
                x2={xScale(BAND_BREAKS.yellow / 2)}
                y2={HIST_BASE - 4}
                stroke={bandColor("red").solid}
                strokeWidth={1}
                strokeDasharray="2 3"
                opacity={0.5}
              />
            </g>
          ) : null}

          {/* axis labels */}
          <text x={xScale(0)} y={AXIS_Y} className="fill-muted-foreground" fontSize={11}>0 · At risk</text>
          <text x={xScale(BAND_BREAKS.yellow)} y={AXIS_Y} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{BAND_BREAKS.yellow}</text>
          <text x={xScale(BAND_BREAKS.green)} y={AXIS_Y} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{BAND_BREAKS.green}</text>
          <text x={xScale(100)} y={AXIS_Y} textAnchor="end" className="fill-muted-foreground" fontSize={11}>Healthy · 100</text>
        </svg>
      </CardContent>
    </Card>
  );
}
