"use client";

/**
 * A small, styled, cursor-following tooltip for the bespoke charts — the
 * lightweight counterpart to the full AccountHoverCard. Fixed + pointer-transparent
 * so it never intercepts hover, and clamped to the viewport so it can't spill off
 * the right edge. Charts keep a `Tip | null` in state and render one of these.
 */
export interface Tip {
  x: number;
  y: number;
  content: React.ReactNode;
}

const OFFSET = 14;
const MAX_W = 240;

export function ChartTooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const left = tip.x + OFFSET + MAX_W < vw ? tip.x + OFFSET : Math.max(8, tip.x - OFFSET - MAX_W);
  const top = Math.min(tip.y + OFFSET, vh - 90);
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border bg-popover/95 px-2.5 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl backdrop-blur"
      style={{ left, top, maxWidth: MAX_W }}
    >
      {tip.content}
    </div>
  );
}
