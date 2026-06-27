import "server-only";

import {
  aggregateBreakdown,
  aggregateGeo,
  aggregateStateDept,
  parseSegmentation,
  sum,
  type GeoAggregate,
  type RawSegmentation,
  type StateDeptTotal,
} from "@/lib/amplitude-parse";
import type {
  BreakdownResponse,
  Device,
  Environment,
  Metric,
  Role,
  TrendResponse,
} from "@/lib/types";

/**
 * Server-only Amplitude Dashboard REST client (Event Segmentation).
 *
 * The browser NEVER imports this module — `import "server-only"` fails the
 * build if it tries — so the API key/secret stay on the server (spec §2).
 * All pure parsing lives in lib/amplitude-parse.ts and is unit tested.
 */

const BASE_URL = process.env.AMPLITUDE_BASE_URL ?? "https://amplitude.com";
const UPSTREAM_REVALIDATE = 600; // seconds — second cache layer below the route

/** Thrown when env credentials are missing; routes map this to a 500 + hint. */
export class AmplitudeConfigError extends Error {}
/** Thrown when the upstream call fails; routes map this to a 502. */
export class AmplitudeUpstreamError extends Error {}

function authHeader(): string {
  const key = process.env.AMPLITUDE_API_KEY;
  const secret = process.env.AMPLITUDE_SECRET_KEY;
  if (!key || !secret) {
    throw new AmplitudeConfigError(
      "Amplitude credentials missing. Set AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY in .env.local (see .env.local.example).",
    );
  }
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

// --- Request building -------------------------------------------------------

type GroupBy = "State" | "Department" | "Device" | "UserGroup";

interface SegmentationOpts {
  event: string;
  metric: Metric;
  start: string; // YYYYMMDD
  end: string; // YYYYMMDD
  env: Environment;
  role?: Role;
  device?: Device;
  /** Pin results to one state (drill-down). */
  state?: string;
  /** Up to two group-by dimensions. */
  groupBy?: GroupBy[];
}

interface EventFilter {
  subprop_type: "event";
  subprop_key: string;
  subprop_op: "is";
  subprop_value: string[];
}

function prop(key: string, value: string): EventFilter {
  return {
    subprop_type: "event",
    subprop_key: key,
    subprop_op: "is",
    subprop_value: [value],
  };
}

function buildEventDefinition(opts: SegmentationOpts) {
  const filters: EventFilter[] = [];
  if (opts.env === "Prod") filters.push(prop("Environment", "Prod"));
  if (opts.role && opts.role !== "all") filters.push(prop("UserGroup", opts.role));
  if (opts.device && opts.device !== "all") filters.push(prop("Device", opts.device));
  if (opts.state) filters.push(prop("State", opts.state));
  return {
    event_type: opts.event,
    filters,
    group_by: (opts.groupBy ?? []).map((value) => ({ type: "event" as const, value })),
  };
}

async function segmentation(opts: SegmentationOpts): Promise<RawSegmentation> {
  const e = JSON.stringify(buildEventDefinition(opts));
  const params = new URLSearchParams({
    e,
    m: opts.metric,
    start: opts.start,
    end: opts.end,
    i: "1", // daily interval
    limit: "1000",
  });
  const url = `${BASE_URL}/api/2/events/segmentation?${params.toString()}`;

  // Resolve credentials BEFORE the try so a missing-key error surfaces as a
  // config error (500), not a wrapped upstream error (502).
  const auth = authHeader();

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: auth },
      next: { revalidate: UPSTREAM_REVALIDATE },
    });
  } catch (err) {
    throw new AmplitudeUpstreamError(
      `Could not reach Amplitude: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AmplitudeUpstreamError(
      `Amplitude returned ${res.status} ${res.statusText}. ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as RawSegmentation;
  if (process.env.AMPLITUDE_DEBUG === "1") {
    // One-time shape inspection — lock the parser to the real response.
    console.log("[amplitude] raw response:", JSON.stringify(json).slice(0, 4000));
  }
  return json;
}

// --- Public API (used by route handlers) -----------------------------------

export type GeoResult = GeoAggregate;

/** State totals for the choropleth (group_by State). */
export async function getGeo(
  opts: Omit<SegmentationOpts, "groupBy" | "state">,
): Promise<GeoResult> {
  const raw = await segmentation({ ...opts, groupBy: ["State"] });
  return aggregateGeo(parseSegmentation(raw).parsed);
}

/** A sub-dimension breakdown within one state (group_by State + dimension). */
export async function getBreakdown(
  opts: Omit<SegmentationOpts, "groupBy"> & { dimension: GroupBy },
): Promise<BreakdownResponse> {
  const raw = await segmentation({ ...opts, groupBy: ["State", opts.dimension] });
  const groups = aggregateBreakdown(parseSegmentation(raw).parsed);
  return { groups, total: groups.reduce((a, g) => a + g.total, 0) };
}

/** Daily trend within one state (no group_by). */
export async function getTrend(
  opts: Omit<SegmentationOpts, "groupBy">,
): Promise<TrendResponse> {
  const raw = await segmentation({ ...opts, groupBy: [] });
  const { parsed, xValues } = parseSegmentation(raw);
  const values = parsed[0]?.series ?? [];
  return { labels: xValues, values, total: sum(values) };
}

/** Per-(state,department) totals for one window — powers the health board. */
export async function getAgencyTotals(
  window: { start: string; end: string },
  opts: { event: string; metric: Metric; env: Environment },
): Promise<StateDeptTotal[]> {
  const raw = await segmentation({
    event: opts.event,
    metric: opts.metric,
    start: window.start,
    end: window.end,
    env: opts.env,
    groupBy: ["State", "Department"],
  });
  return aggregateStateDept(parseSegmentation(raw).parsed);
}
