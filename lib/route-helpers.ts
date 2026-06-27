import "server-only";

import { NextResponse } from "next/server";

import { AmplitudeConfigError, AmplitudeUpstreamError } from "@/lib/amplitude";
import { rangeToDates } from "@/lib/query";
import type {
  Device,
  Environment,
  Metric,
  Role,
  TimeRange,
} from "@/lib/types";

/** Shared base options parsed from any /api/* request's query string. */
export interface ParsedQuery {
  event: string;
  metric: Metric;
  start: string;
  end: string;
  env: Environment;
  role: Role;
  device: Device;
  hideTest: boolean;
}

const METRICS: Metric[] = ["totals", "uniques"];
const RANGES: TimeRange[] = ["30d", "90d", "6mo", "12mo"];
const ROLES: Role[] = ["all", "officer", "admin", "superadmin", "guest"];
const DEVICES: Device[] = ["all", "iPhone", "iPad", "Android", "Browser"];

function oneOf<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function parseQuery(searchParams: URLSearchParams): ParsedQuery {
  const event = searchParams.get("event")?.trim();
  if (!event) {
    throw new BadRequest("Missing required `event` query parameter.");
  }
  const range = oneOf(searchParams.get("range"), RANGES, "90d");
  const { start, end } = rangeToDates(range);
  return {
    event,
    metric: oneOf(searchParams.get("metric"), METRICS, "totals"),
    start,
    end,
    env: searchParams.get("env") === "All" ? "All" : "Prod",
    role: oneOf(searchParams.get("role"), ROLES, "all"),
    device: oneOf(searchParams.get("device"), DEVICES, "all"),
    hideTest: searchParams.get("hideTest") === "1",
  };
}

/** Thrown for client errors (400). */
export class BadRequest extends Error {}

/** Map thrown errors to appropriate JSON responses. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof BadRequest) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof AmplitudeConfigError) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  if (err instanceof AmplitudeUpstreamError) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Decode a [name] dynamic segment (e.g. "New%20Jersey" → "New Jersey"). */
export function decodeStateName(raw: string): string {
  return decodeURIComponent(raw).trim();
}
