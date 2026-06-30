"use client";

import { useId } from "react";

import type { Band, LensScores } from "@/lib/intelligence";
import { bandColor, glyphGeometry } from "@/components/intelligence/lens";
import { cn } from "@/lib/utils";

/**
 * The signature account glyph: a four-spoke radial signature (momentum top,
 * trust right, breadth bottom, activation left) whose shape encodes the lens
 * scores and whose color encodes the composite band. Renders crisp from 28px
 * roster size to 220px focus size.
 */
export function LensGlyph({
  lenses,
  band,
  size = 44,
  glow = false,
  showSpokeNodes = true,
  className,
}: {
  lenses: LensScores;
  band: Band;
  size?: number;
  glow?: boolean;
  showSpokeNodes?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const { spokes, path, center, r } = glyphGeometry(lenses, size);
  const c = bandColor(band);
  const big = size >= 90;
  // Minimal, high-impact glow: only at-risk signatures get a soft halo so the
  // eye lands on risk first — every other band stays flat (matches the old board).
  const emphasize = glow || band === "red";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={`Account signature, ${c.label}`}
    >
      <defs>
        <radialGradient id={`fill-${uid}`} cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor={c.solid} stopOpacity={big ? 0.5 : 0.42} />
          <stop offset="100%" stopColor={c.solid} stopOpacity={0.08} />
        </radialGradient>
        {emphasize ? (
          <filter id={`glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={big ? 2.2 : 1} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ) : null}
      </defs>

      {/* faint concentric guides */}
      {[0.92, 0.5].map((k, i) => (
        <circle
          key={i}
          cx={center.x}
          cy={center.y}
          r={r * 0.92 * k}
          fill="none"
          stroke="currentColor"
          strokeOpacity={i === 0 ? 0.1 : 0.06}
          strokeWidth={1}
        />
      ))}

      <g filter={emphasize ? `url(#glow-${uid})` : undefined}>
        {/* spokes */}
        {spokes.map((s) => (
          <line
            key={s.key}
            x1={center.x}
            y1={center.y}
            x2={s.tip.x}
            y2={s.tip.y}
            stroke={c.solid}
            strokeOpacity={s.ghost ? 0.22 : 0.55}
            strokeWidth={big ? 1.4 : 1}
            strokeDasharray={s.ghost ? "2 3" : undefined}
          />
        ))}
        {/* membrane */}
        <path
          d={path}
          fill={`url(#fill-${uid})`}
          stroke={c.solid}
          strokeWidth={big ? 2 : 1.4}
          strokeLinejoin="round"
          strokeOpacity={0.95}
        />
        {/* spoke tips */}
        {showSpokeNodes &&
          spokes.map((s) =>
            s.ghost ? null : (
              <circle key={s.key} cx={s.tip.x} cy={s.tip.y} r={big ? 3 : 1.7} fill={c.solid} />
            ),
          )}
        {/* core */}
        <circle cx={center.x} cy={center.y} r={big ? 3.4 : 1.8} fill={c.solid} />
        <circle cx={center.x} cy={center.y} r={big ? 3.4 : 1.8} fill="#000" fillOpacity={0.35} />
      </g>
    </svg>
  );
}
