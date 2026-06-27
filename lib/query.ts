import type {
  Device,
  Environment,
  Metric,
  Role,
  TimeRange,
} from "@/lib/types";

/**
 * The full set of user-controlled filters held by the Explorer and persisted
 * to localStorage. Shared by the client (to build requests) and conceptually
 * mirrored by the route handlers (which read these as query params).
 */
export type MapView = "geo" | "grid";

export interface Filters {
  event: string;
  metric: Metric;
  range: TimeRange;
  env: Environment;
  role: Role;
  device: Device;
  hideTest: boolean;
  /** Presentation only — geographic choropleth vs tile-grid cartogram. */
  mapView: MapView;
}

export const DEFAULT_FILTERS: Omit<Filters, "event"> = {
  metric: "totals",
  range: "90d",
  env: "Prod",
  role: "all",
  device: "all",
  hideTest: true,
  mapView: "geo",
};

/** Names matching this pattern are test/demo departments (spec §6). */
export const TEST_DEPT_RE = /test|e2e|demo|qa-|sandbox|red voice|evaluation|interns|inactive/i;

export function isTestDepartment(name: string): boolean {
  return TEST_DEPT_RE.test(name);
}

const RANGE_DAYS: Record<TimeRange, number> = {
  "30d": 30,
  "90d": 90,
  "6mo": 182,
  "12mo": 365,
};

/** Format a Date as YYYYMMDD in the project timezone (America/New_York). */
function formatAmplitudeDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Compute Amplitude `start`/`end` (YYYYMMDD) for a relative range. */
export function rangeToDates(range: TimeRange): { start: string; end: string } {
  const now = new Date();
  const days = RANGE_DAYS[range];
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: formatAmplitudeDate(startDate), end: formatAmplitudeDate(now) };
}

/** Build the query string the client sends to our own /api/* routes. */
export function buildApiQuery(filters: Filters): string {
  const params = new URLSearchParams({
    event: filters.event,
    metric: filters.metric,
    range: filters.range,
    env: filters.env,
  });
  if (filters.role !== "all") params.set("role", filters.role);
  if (filters.device !== "all") params.set("device", filters.device);
  if (filters.hideTest) params.set("hideTest", "1");
  return params.toString();
}

/** Thin typed fetch wrapper used by React Query hooks on the client. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new Error(`Request failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}
