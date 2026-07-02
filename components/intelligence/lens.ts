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
import { BAND_BREAKS, type AccountIntelligence, type Band, type LensScores } from "@/lib/intelligence";

/**
 * The Tailwind palette tokens the console draws from. SVG fills need literal
 * colour strings (not utility classes), so we pin the exact Tailwind v4 hexes
 * here in ONE place — change a token and it flows to every chart. Semantic
 * health uses red / amber / emerald; categorical accents use blue / indigo /
 * teal / violet / pink.
 */
const TW = {
  red700: "#b91c1c",
  red500: "#ef4444",
  amber600: "#d97706",
  amber500: "#f59e0b",
  amber400: "#fbbf24",
  emerald600: "#059669",
  emerald500: "#10b981",
  blue500: "#3b82f6",
  indigo500: "#6366f1",
  teal500: "#14b8a6",
  violet500: "#8b5cf6",
  pink500: "#ec4899",
} as const;

/** Public Tailwind tokens for callers outside the band system (e.g. the value
 *  "upside" accent). Keeps every literal hex sourced from this file. */
export const ACCENT = { signal: TW.blue500, value: TW.pink500 } as const;

/** Build an `rgba()` string from one of the hex tokens above. */
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

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
 * around an even pentagon (72° apart). Accents are Tailwind categorical tokens
 * (blue-500 / indigo-500 / teal-500 / violet-500) — angle disambiguates the
 * spokes, so close hues are fine and they stay clear of the semantic R/A/G band
 * colours below.
 */
export const LENSES: LensDef[] = [
  { key: "activity", label: "Usage", short: "Usage", angle: 0, accent: TW.blue500, blurb: "How much they use it, ranked against the rest of the book" },
  { key: "momentum", label: "Trend", short: "Trend", angle: 90, accent: TW.indigo500, blurb: "Usage direction — growing or shrinking vs last month" },
  { key: "trust", label: "Answer quality", short: "Quality", angle: 180, accent: TW.teal500, blurb: "Do officers trust the answers, or re-ask and downvote?" },
  { key: "breadth", label: "Feature adoption", short: "Tools", angle: 270, accent: TW.violet500, blurb: "How many of the product's tools they actually use" },
];

// --- Band / composite color ramp --------------------------------------------
// All hues are Tailwind tokens (see TW below) so the console reads as one
// product and inherits Tailwind's perceptually-tuned ramps. Red→amber→green is
// kept for its universal "health" semantics, but red (red-500) and green
// (emerald-500) differ in LIGHTNESS as well as hue — the channel red/green
// colour-blind viewers can still see — and every chart pairs band colour with a
// redundant position encoding so no read depends on hue alone.

const BAND: Record<Band, { solid: string; soft: string; glow: string; label: string }> = {
  red: { solid: TW.red500, soft: rgba(TW.red500, 0.12), glow: rgba(TW.red500, 0.35), label: "At risk" },
  yellow: { solid: TW.amber500, soft: rgba(TW.amber500, 0.12), glow: rgba(TW.amber500, 0.28), label: "Watch" },
  green: { solid: TW.emerald500, soft: rgba(TW.emerald500, 0.12), glow: rgba(TW.emerald500, 0.28), label: "Healthy" },
};

export function bandColor(band: Band) {
  return BAND[band];
}

/** Non-health accent for adoption bars (Tailwind blue-500). */
export const SIGNAL = TW.blue500;

/**
 * Composite color ramp — BAND-ALIGNED so a tile's hue always matches its score
 * and band badge. Each band keeps its own Tailwind colour family across its
 * score range, with a light→dark gradient *within* the band for nuance. The hue
 * flips EXACTLY at `BAND_BREAKS` (40 / 66) — the same thresholds `bandFor`
 * uses — so 62 reads amber (Watch), not green, and the ramp can never drift
 * from the band logic.
 */
export function compositeRamp(score: number): string {
  const s = clamp(score, 0, 100);
  const { yellow, green } = BAND_BREAKS;
  if (s < yellow) return lerpHex(TW.red700, TW.red500, s / yellow); // red band
  if (s < green) return lerpHex(TW.amber600, TW.amber400, (s - yellow) / (green - yellow)); // amber band
  return lerpHex(TW.emerald500, TW.emerald600, (s - green) / (100 - green)); // green band
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
