"use client";

import type { AccountIntelligence } from "@/lib/intelligence";
import { AccountFocus } from "@/components/intelligence/AccountFocus";

const W = 480;
const ESTIMATED_H = 300;

/**
 * The shared account signature, summoned on hover from any visualization. A
 * fixed, pointer-transparent overlay that follows the cursor and clamps to the
 * viewport so it never spills off-screen.
 */
export function AccountHoverCard({
  account,
  x,
  y,
}: {
  account: AccountIntelligence;
  x: number;
  y: number;
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  // Flip to the left of the cursor when there isn't room on the right.
  const left = x + 20 + W < vw ? x + 20 : Math.max(12, x - W - 20);
  const top = Math.max(12, Math.min(y + 16, vh - ESTIMATED_H - 12));

  return (
    <div className="pointer-events-none fixed z-50 drop-shadow-2xl" style={{ left, top, width: W }}>
      <AccountFocus account={account} />
    </div>
  );
}
