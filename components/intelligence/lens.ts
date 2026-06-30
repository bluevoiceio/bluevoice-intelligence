/**
 * Visual language for the Intelligence Console. Pure (no React/DOM) so the same
 * geometry drives the small roster glyphs and the large focus glyph identically.
 *
 * The signature motif is the LENS GLYPH: each account is a four-spoke radial
 * signature — momentum (top), trust (right), breadth (bottom), activation
 * (left) — where spoke length encodes the 0–100 lens score and the whole shape
 * is tinted by the account's composite band. Shape carries the story; color
 * carries the verdict.
 */
import type { AccountIntelligence, Band, LensScores } from "@/lib/intelligence";

export type LensKey = "momentum" | "trust" | "breadth" | "activation";

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
 * Order is the polygon winding order: top → right → bottom → left. Accents are
 * a restrained, professional categorical set (blue/indigo/violet/teal).
 */
export const LENSES: LensDef[] = [
  { key: "momentum", label: "Momentum", short: "MOM", angle: 0, accent: "#3b82f6", blurb: "Usage trend, month over month" },
  { key: "trust", label: "Trust", short: "TRU", angle: 90, accent: "#6366f1", blurb: "Answer quality — friction & re-asks" },
  { key: "breadth", label: "Breadth", short: "BRD", angle: 180, accent: "#a855f7", blurb: "Product-pillar adoption" },
  { key: "activation", label: "Activation", short: "ACT", angle: 270, accent: "#14b8a6", blurb: "Time-to-value for new officers" },
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

/** Continuous composite ramp for fine gradients (red→amber→green). */
export function compositeRamp(score: number): string {
  const s = clamp(score, 0, 100);
  if (s <= 40) return lerpHex("#e5484d", "#d9930a", s / 40);
  if (s <= 75) return lerpHex("#d9930a", "#2bb673", (s - 40) / 35);
  return lerpHex("#2bb673", "#1f9e63", (s - 75) / 25);
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
