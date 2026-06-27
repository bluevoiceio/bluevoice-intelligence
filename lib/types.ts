/**
 * Shared types for the Geographic Explorer.
 *
 * These describe the *logical* model the app works with — deliberately
 * decoupled from Amplitude's raw segmentation response shape (see
 * `lib/amplitude.ts` for the parser that produces these).
 */

export type Metric = "totals" | "uniques";

export type TimeRange = "30d" | "90d" | "6mo" | "12mo";

export type Environment = "Prod" | "All";

export type Role = "all" | "officer" | "admin" | "superadmin" | "guest";

export type Device = "all" | "iPhone" | "iPad" | "Android" | "Browser";

/** A single group's collapsed total, e.g. { key: "Massachusetts", total: 17702 }. */
export interface GroupTotal {
  key: string;
  total: number;
}

/** Daily time series returned for the trend view. */
export interface Trend {
  labels: string[];
  values: number[];
}

/** Response of GET /api/geo — state-level totals for the choropleth. */
export interface GeoResponse {
  /** Joined-by-full-state-name totals, e.g. { Massachusetts: 17702 }. */
  byState: Record<string, number>;
  /** Grand total across all tagged states (excludes `(none)`). */
  total: number;
  /** Number of states with at least one event. */
  activeStates: number;
  /** Count of events with no `State` property set — surfaced as a footnote. */
  untagged: number;
  /** True when most of this event's volume is untagged → coverage warning. */
  lowCoverage: boolean;
}

/** Response of the state drill-down breakdown routes. */
export interface BreakdownResponse {
  groups: GroupTotal[];
  total: number;
}

/** Response of GET /api/state/[name]/trend. */
export interface TrendResponse extends Trend {
  total: number;
}

/** A selectable product event, as returned by GET /api/events. */
export interface EventOption {
  /** The Amplitude `event_type`, e.g. "New Question Asked". */
  value: string;
  /** Display label, e.g. "Questions Asked". */
  label: string;
  /** Geographic coverage tier — drives default selection and warnings. */
  coverage: "full" | "partial" | "none";
}
