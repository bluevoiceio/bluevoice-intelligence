/**
 * Visual language for the Intelligence Console. Pure (no React/DOM) so the same
 * geometry drives the small roster glyphs and the large focus glyph identically.
 *
 * The signature motif is the LENS GLYPH: each account is a four-spoke radial
 * signature of the HEALTH signals that actually carry data — usage, trend,
 * answer quality, feature adoption — where spoke length encodes the 0–100 lens
 * score and the whole shape is tinted by the account's health band. Shape
 * carries the story; color carries the verdict. (Value delivered is shown
 * separately as expansion upside; onboarding is omitted — too sparse at the
 * department grain to populate.)
 */
import type { AccountIntelligence, Band, LensScores } from "@/lib/intelligence";

export type LensKey = "activity" | "momentum" | "trust" | "realization" | "breadth" | "activation";

export interface LensDef {
  key: LensKey;
  label: string;
  /** One-word telemetry label. */
  short: string;
  /** Spoke direction, degrees clockwise from 12 o'clock. */
  angle: number;
  /** Accent used for per-lens bars in the focus panel / legend. */
  accent: string;
  blurb: string;
}

/**
 * Order is the polygon winding order: momentum at 12 o'clock, then clockwise
 * around an even pentagon (72° apart). Accents are a restrained, professional
 * categorical set (blue/indigo/rose/violet/teal).
 */
export const LENSES: LensDef[] = [
  { key: "activity", label: "Usage", short: "Usage", angle: 0, accent: "#3b82f6", blurb: "How much they use it, ranked against the rest of the book" },
  { key: "momentum", label: "Trend", short: "Trend", angle: 90, accent: "#6366f1", blurb: "Usage direction — growing or shrinking vs last month" },
  { key: "trust", label: "Answer quality", short: "Quality", angle: 180, accent: "#14b8a6", blurb: "Do officers trust the answers, or re-ask and downvote?" },
  { key: "breadth", label: "Feature adoption", short: "Tools", angle: 270, accent: "#a855f7", blurb: "How many of the product's tools they actually use" },
];

// --- Band / composite color ramp --------------------------------------------
// Calm, semantic health hexes shared with the app's viz.ts so the console reads
// as part of the same product — not a neon one-off.

const BAND: Record<Band, { solid: string; soft: string; glow: string; label: string }> = {
  red: { solid: "#e5484d", soft: "rgba(229,72,77,0.12)", glow: "rgba(229,72,77,0.35)", label: "At risk" },
  yellow: { solid: "#d9930a", soft: "rgba(217,147,10,0.12)", glow: "rgba(217,147,10,0.25)", label: "Watch" },
  green: { solid: "#2bb673", soft: "rgba(43,182,115,0.12)", glow: "rgba(43,182,115,0.25)", label: "Healthy" },
};

export function bandColor(band: Band) {
  return BAND[band];
}

/** Non-health accent for adoption bars (brand blue). */
export const SIGNAL = "#3b82f6";

/**
 * Composite color ramp — BAND-ALIGNED so a tile's hue always matches its score
 * and band badge. Each band keeps its own colour family across its score range
 * (red <40, amber 40–69, green ≥70), with a light→dark gradient *within* the
 * band for nuance. The hue flips exactly at the 40/70 band boundaries, the same
 * thresholds `bandFor`/`bandColor` use — so 62 reads amber (Watch), not green.
 */
export function compositeRamp(score: number): string {
  const s = clamp(score, 0, 100);
  if (s < 40) return lerpHex("#c0383c", "#e5484d", s / 40); // red band
  if (s < 66) return lerpHex("#c9870a", "#e8b13a", (s - 40) / 26); // amber band
  return lerpHex("#2bb673", "#1f9e63", (s - 66) / 34); // green band
}

// --- Glyph geometry ----------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

export interface GlyphSpoke {
  key: LensKey;
  tip: Pt;
  /** True when the lens has no signal (drawn as a faint ghost stub). */
  ghost: boolean;
  value: number | null;
}

export interface GlyphGeometry {
  spokes: GlyphSpoke[];
  /** Closed polygon `d` through the four spoke tips. */
  path: string;
  center: Pt;
  r: number;
}

/** Even a 0-score spoke shows a stub so the glyph never collapses to a dot. */
const BASELINE = 0.16;

function spokeLen(value: number | null, r: number): number {
  const v = value == null ? 0 : clamp(value, 0, 100) / 100;
  return r * (BASELINE + (1 - BASELINE) * v);
}

/**
 * Build the glyph geometry for a size-`size` box. Returns spoke tips (in box
 * coordinates) and the closed polygon path through them.
 */
export function glyphGeometry(lenses: LensScores, size: number): GlyphGeometry {
  const r = size / 2;
  const c = { x: r, y: r };
  const spokes: GlyphSpoke[] = LENSES.map((def) => {
    const value = lenses[def.key];
    const len = spokeLen(value, r * 0.92);
    const rad = ((def.angle - 90) * Math.PI) / 180; // 0° = up
    return {
      key: def.key,
      ghost: value == null,
      value,
      tip: { x: c.x + len * Math.cos(rad), y: c.y + len * Math.sin(rad) },
    };
  });
  const path =
    spokes.map((s, i) => `${i === 0 ? "M" : "L"}${s.tip.x.toFixed(2)},${s.tip.y.toFixed(2)}`).join(" ") + " Z";
  return { spokes, path, center: c, r };
}

/**
 * Where a lens's value label sits around the glyph, as box-fraction CSS
 * left/top to pair with `translate(-50%, -50%)`. Angle-driven so it lands
 * correctly for any spoke at any count (pentagon today, not the old four
 * cardinal directions). `radiusFrac` 0.58 sits just outside the spoke tips.
 */
export function lensLabelAnchor(angle: number, radiusFrac = 0.58): { left: string; top: string } {
  const rad = ((angle - 90) * Math.PI) / 180; // 0° = up
  return {
    left: `${(50 + radiusFrac * 100 * Math.cos(rad)).toFixed(1)}%`,
    top: `${(50 + radiusFrac * 100 * Math.sin(rad)).toFixed(1)}%`,
  };
}

// --- Formatting helpers ------------------------------------------------------

export function deltaPctLabel(a: Pick<AccountIntelligence, "deltaPct" | "status">): string {
  if (a.status === "new") return "NEW";
  if (a.deltaPct == null) return "—";
  const r = Math.round(a.deltaPct);
  return `${r < 0 ? "−" : "+"}${Math.abs(r)}%`;
}

/** The product pillars the breadth lens scores — order is shared across the UI. */
export const PILLAR_KEYS = ["ask", "documents", "workspace", "redaction", "compliance"] as const;
export const PILLAR_LABELS = ["Ask", "Documents", "Workspace", "Redaction", "Compliance"] as const;
export const PILLAR_COUNT = PILLAR_KEYS.length;

// --- math --------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const f = clamp(t, 0, 1);
  const ch = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * f);
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(ch(0))}${hx(ch(1))}${hx(ch(2))}`;
}
