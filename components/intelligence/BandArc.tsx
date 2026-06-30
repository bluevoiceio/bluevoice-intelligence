"use client";

import type { Band } from "@/lib/intelligence";
import { bandColor } from "@/components/intelligence/lens";
import { fmt } from "@/lib/format";

const ORDER: Band[] = ["green", "yellow", "red"];

/**
 * Donut of the whole book split by composite band. Center reads the total
 * account count; segments are the green/yellow/red proportions. Flat and crisp
 * — no glow.
 */
export function BandArc({
  bands,
  total,
  size = 188,
}: {
  bands: Record<Band, number>;
  total: number;
  size?: number;
}) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = 0.016 * circ;

  const fracs = ORDER.map((band) => (total > 0 ? bands[band] / total : 0));
  const segs = ORDER.map((band, i) => {
    const start = fracs.slice(0, i).reduce((a, b) => a + b, 0);
    const len = Math.max(0, fracs[i] * circ - gap);
    return { band, dash: len, gapDash: circ - len, rotate: start * 360 };
  });

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          {/* minimal high-impact glow — at-risk segment only */}
          <filter id="band-risk-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
        {segs.map((s) => (
          <circle
            key={s.band}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={bandColor(s.band).solid}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${s.dash} ${s.gapDash}`}
            strokeDashoffset={-(s.rotate / 360) * circ}
            filter={s.band === "red" ? "url(#band-risk-glow)" : undefined}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-4xl font-semibold tabular-nums tracking-tight">{fmt(total)}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            accounts
          </div>
        </div>
      </div>
    </div>
  );
}
