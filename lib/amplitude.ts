import "server-only";

import {
  aggregateStateDept,
  bucketDailyToMonthly,
  parseSegmentation,
  type RawSegmentation,
  type StateDeptTotal,
  type TrendSeries,
} from "@/lib/amplitude-parse";
import type { Device, Environment, Metric, Role } from "@/lib/types";

/**
 * Server-only Amplitude Dashboard REST client (Event Segmentation).
 *
 * The browser NEVER imports this module — `import "server-only"` fails the
 * build if it tries — so the API key/secret stay on the server (spec §2).
 * All pure parsing lives in lib/amplitude-parse.ts and is unit tested.
 */

const BASE_URL = process.env.AMPLITUDE_BASE_URL ?? "https://amplitude.com";
const UPSTREAM_REVALIDATE = 600; // seconds — second cache layer below the route
const MAX_ATTEMPTS = 3; // 1 try + 2 retries on 429/5xx

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Exponential-ish backoff with jitter: ~400ms, ~900ms. */
const backoffMs = (attempt: number) => 400 * (attempt + 1) + Math.floor(Math.random() * 250);

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

  // The board fires several segmentation calls at once; Amplitude rate-limits
  // bursts (429) and occasionally 5xxs. Retry those transiently with backoff so
  // a throttled secondary call doesn't come back empty and read as "0% adopted".
  let lastError = "Amplitude request failed";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: auth },
        next: { revalidate: UPSTREAM_REVALIDATE },
      });
    } catch (err) {
      lastError = `Could not reach Amplitude: ${(err as Error).message}`;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new AmplitudeUpstreamError(lastError);
    }

    if (res.ok) {
      const json = (await res.json()) as RawSegmentation;
      if (process.env.AMPLITUDE_DEBUG === "1") {
        // One-time shape inspection — lock the parser to the real response.
        console.log("[amplitude] raw response:", JSON.stringify(json).slice(0, 4000));
      }
      return json;
    }

    const retriable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => "");
    lastError = `Amplitude returned ${res.status} ${res.statusText}. ${body.slice(0, 300)}`;
    if (!retriable || attempt === MAX_ATTEMPTS - 1) {
      throw new AmplitudeUpstreamError(lastError);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
  }
  throw new AmplitudeUpstreamError(lastError);
}

// --- Public API (used by route handlers) -----------------------------------

/** Per-(state,department) totals for one window — powers the intelligence board. */
export async function getAgencyTotals(
  window: { start: string; end: string },
  opts: { event: string; metric: Metric; env: Environment; role?: Role },
): Promise<StateDeptTotal[]> {
  const raw = await segmentation({
    event: opts.event,
    metric: opts.metric,
    start: window.start,
    end: window.end,
    env: opts.env,
    role: opts.role,
    groupBy: ["State", "Department"],
  });
  return aggregateStateDept(parseSegmentation(raw).parsed);
}

/**
 * Book-wide monthly trend for a single event (no group-by), for the adoption
 * sparklines. Fetches a daily series over the window and buckets it to months
 * — mirrors the daily-fetch-then-bucket pattern of the weekly board series.
 */
export async function getEventTrend(
  window: { start: string; end: string },
  opts: { event: string; env: Environment },
): Promise<TrendSeries> {
  const raw = await segmentation({
    event: opts.event,
    metric: "totals",
    start: window.start,
    end: window.end,
    env: opts.env,
    groupBy: [],
  });
  const { parsed, xValues } = parseSegmentation(raw);
  const daily = parsed[0]?.series ?? [];
  // Drop the current, still-incomplete calendar month: a 2-day partial bucket
  // reads as a cliff and would flip every rising trend to "slipping". Bucket
  // everything, remove the current month, then keep the last 6 whole-ish months.
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = bucketDailyToMonthly(daily, xValues, 24).filter((p) => p.month !== currentMonth);
  return { event: opts.event, points: months.slice(-6) };
}
