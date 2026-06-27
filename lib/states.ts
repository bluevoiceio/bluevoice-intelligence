import { scaleSqrt } from "d3-scale";

/**
 * Full state name ↔ USPS code. Amplitude's `State` property returns full
 * names ("Massachusetts"); the us-atlas TopoJSON exposes the same full name
 * via `geo.properties.name`, so we join on the full name and use USPS codes
 * only for compact labels/legends.
 */
export const STATE_NAME_TO_USPS: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "Puerto Rico": "PR",
};

/** Normalize a raw Amplitude state value for joining against the TopoJSON. */
export function normalizeStateName(raw: string): string {
  return raw.trim();
}

/** True for the sentinel Amplitude uses when a property wasn't set. */
export function isUntagged(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k === "(none)" || k === "" || k === "undefined" || k === "null";
}

export function uspsFor(name: string): string | undefined {
  return STATE_NAME_TO_USPS[normalizeStateName(name)];
}

// --- Choropleth color scale -------------------------------------------------
// Data skews heavily to one state (Massachusetts ≈ 60%+), so we use a sqrt
// scale: it compresses the dominant value and keeps mid-tier states legible.

/**
 * Monochrome slate ramp, theme-aware. In light mode "no data" is the lightest
 * shade and value darkens; in dark mode it inverts (no-data recedes into the
 * dark card, higher value gets brighter). Endpoints keep "no data" the least
 * prominent shade in both themes.
 */
export interface MapPalette {
  low: string;
  high: string;
  empty: string;
  hover: string;
}

export const MAP_PALETTE_LIGHT: MapPalette = {
  low: "#e2e8f0", // slate-200 — lowest data
  high: "#0f172a", // slate-900 — highest data
  empty: "#f1f5f9", // slate-100 — "no data" (lightest)
  hover: "#334155", // slate-700
};

export const MAP_PALETTE_DARK: MapPalette = {
  low: "#334155", // slate-700 — lowest data
  high: "#e2e8f0", // slate-200 — highest data (brightest)
  empty: "#1e293b", // slate-800 — "no data" (recedes into card)
  hover: "#cbd5e1", // slate-300
};

export function mapPalette(dark: boolean): MapPalette {
  return dark ? MAP_PALETTE_DARK : MAP_PALETTE_LIGHT;
}

// Light-palette aliases kept for back-compat (and unit tests).
export const MAP_COLOR_LOW = MAP_PALETTE_LIGHT.low;
export const MAP_COLOR_HIGH = MAP_PALETTE_LIGHT.high;
export const MAP_COLOR_EMPTY = MAP_PALETTE_LIGHT.empty;
export const MAP_COLOR_HOVER = MAP_PALETTE_LIGHT.hover;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Build a value → hex-color function over [0, max] using a sqrt scale,
 * interpolating from palette.low to palette.high (defaults to the light ramp).
 */
export function makeColorScale(
  max: number,
  palette: MapPalette = MAP_PALETTE_LIGHT,
): (value: number) => string {
  const t = scaleSqrt().domain([0, Math.max(max, 1)]).range([0, 1]).clamp(true);
  const lo = hexToRgb(palette.low);
  const hi = hexToRgb(palette.high);
  return (value: number) => {
    if (!value || value <= 0) return palette.empty;
    const f = t(value);
    return rgbToHex([
      lo[0] + (hi[0] - lo[0]) * f,
      lo[1] + (hi[1] - lo[1]) * f,
      lo[2] + (hi[2] - lo[2]) * f,
    ]);
  };
}

/** Fraction in [0,1] on the same sqrt scale — used to pick tile text contrast. */
export function sqrtFraction(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.sqrt(value) / Math.sqrt(max);
}

// --- Tile-grid (cartogram) layout ------------------------------------------
// USPS → reverse name lookup, plus a tile-grid map layout (11 cols × 8 rows)
// matching the existing Blue Voice grid-map design.

export const USPS_TO_STATE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_USPS).map(([name, usps]) => [usps, name]),
);

export interface GridCell {
  row: number;
  col: number;
}

export const STATE_GRID: Record<string, GridCell> = {
  AK: { row: 0, col: 0 }, ME: { row: 0, col: 10 },
  VT: { row: 1, col: 9 }, NH: { row: 1, col: 10 },
  WA: { row: 2, col: 0 }, ID: { row: 2, col: 1 }, MT: { row: 2, col: 2 }, ND: { row: 2, col: 3 }, MN: { row: 2, col: 4 }, IL: { row: 2, col: 5 }, WI: { row: 2, col: 6 }, MI: { row: 2, col: 7 }, NY: { row: 2, col: 8 }, MA: { row: 2, col: 9 }, RI: { row: 2, col: 10 },
  OR: { row: 3, col: 0 }, NV: { row: 3, col: 1 }, WY: { row: 3, col: 2 }, SD: { row: 3, col: 3 }, IA: { row: 3, col: 4 }, IN: { row: 3, col: 5 }, OH: { row: 3, col: 6 }, PA: { row: 3, col: 7 }, NJ: { row: 3, col: 8 }, CT: { row: 3, col: 9 },
  CA: { row: 4, col: 0 }, UT: { row: 4, col: 1 }, CO: { row: 4, col: 2 }, NE: { row: 4, col: 3 }, MO: { row: 4, col: 4 }, KY: { row: 4, col: 5 }, WV: { row: 4, col: 6 }, VA: { row: 4, col: 7 }, MD: { row: 4, col: 8 }, DE: { row: 4, col: 9 },
  AZ: { row: 5, col: 1 }, NM: { row: 5, col: 2 }, KS: { row: 5, col: 3 }, AR: { row: 5, col: 4 }, TN: { row: 5, col: 5 }, NC: { row: 5, col: 6 }, SC: { row: 5, col: 7 }, DC: { row: 5, col: 8 },
  OK: { row: 6, col: 3 }, LA: { row: 6, col: 4 }, MS: { row: 6, col: 5 }, AL: { row: 6, col: 6 }, GA: { row: 6, col: 7 },
  HI: { row: 7, col: 0 }, TX: { row: 7, col: 3 }, FL: { row: 7, col: 9 },
};

export const GRID_COLS = 11;
export const GRID_ROWS = 8;
