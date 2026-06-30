/**
 * Shared visual language for the Account Health board. Pure (no React/DOM) so it
 * can power SVG, the cartogram, and the treemap identically.
 *
 * Health is the ONE diverging channel: red (churn risk) → amber → emerald
 * (healthy/expanding). Everything else stays in the navy/slate brand. Hexes are
 * tuned to read on both light and dark cards and to match the app's badge colors.
 */
import type { HealthStatus } from "@/lib/health";

export type Band = "red" | "amber" | "green";

export interface HealthColor {
  band: Band;
  /** Saturated stroke / text color. */
  solid: string;
  /** Soft translucent fill for backgrounds. */
  soft: string;
  /** Glow color for awe treatments (drop-shadow / box-shadow). */
  glow: string;
}

const RED = "#e5484d"; // churn risk
const AMBER = "#d9930a"; // watch (aligns with --warning)
const GREEN = "#2bb673"; // healthy / expanding

export function bandOf(score: number): Band {
  if (score < 45) return "red";
  if (score < 68) return "amber";
  return "green";
}

const SOLID: Record<Band, string> = { red: RED, amber: AMBER, green: GREEN };

export function healthColor(score: number): HealthColor {
  const band = bandOf(score);
  const solid = SOLID[band];
  return { band, solid, soft: hexA(solid, 0.14), glow: hexA(solid, 0.55) };
}

export function statusColor(status: HealthStatus): HealthColor {
  const s = status === "decliner" ? 30 : status === "stable" ? 58 : 82;
  return healthColor(s);
}

/**
 * Continuous diverging hex for a 0–100 score: red→amber at 45, amber→green at
 * 68. Used for treemap cells and map tiles where a smooth ramp beats 3 buckets.
 */
export function scoreRamp(score: number): string {
  const s = clamp(score, 0, 100);
  if (s <= 45) return lerpHex(RED, AMBER, s / 45);
  if (s <= 68) return lerpHex(AMBER, GREEN, (s - 45) / 23);
  return lerpHex(GREEN, "#1f9e63", (s - 68) / 32);
}

export const STATUS_LABEL: Record<HealthStatus, string> = {
  decliner: "At risk",
  riser: "Rising",
  new: "New",
  stable: "Stable",
};

// --- SVG path builders ------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

function points(values: number[], w: number, h: number, pad: number): Pt[] {
  const n = values.length;
  if (n === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: n === 1 ? w / 2 : (i / (n - 1)) * w,
    y: h - pad - ((v - min) / span) * (h - 2 * pad),
  }));
}

/** Sparkline path `d` for a series in a w×h box. */
export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  const p = points(values, w, h, pad);
  if (!p.length) return "";
  return p.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
}

/** Closed area path under the sparkline (for gradient fills). */
export function sparkArea(values: number[], w: number, h: number, pad = 2): string {
  const p = points(values, w, h, pad);
  if (!p.length) return "";
  const line = p.map((pt) => `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  return `M${p[0].x.toFixed(1)},${h} ${line} L${p[p.length - 1].x.toFixed(1)},${h} Z`;
}

export function sparkEnd(values: number[], w: number, h: number, pad = 2): Pt {
  const p = points(values, w, h, pad);
  return p[p.length - 1] ?? { x: 0, y: 0 };
}

// --- helpers ----------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Delta chip text. Tolerates a null delta (sub-floor agency) → "—"; new → "new". */
export function deltaLabel(deltaPct: number | null, status: HealthStatus): string {
  if (status === "new") return "new";
  if (deltaPct == null) return "—";
  const r = Math.round(deltaPct);
  return `${r < 0 ? "−" : "+"}${Math.abs(r)}%`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const f = clamp(t, 0, 1);
  const c = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * f);
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(c(0))}${hx(c(1))}${hx(c(2))}`;
}

function hexA(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
