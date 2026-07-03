import { NextResponse } from "next/server";

import { getEventTrend } from "@/lib/amplitude";
import { trailingWindow } from "@/lib/query";
import { errorResponse } from "@/lib/route-helpers";
import type { TrendSeries, TrendsResponse } from "@/lib/amplitude-parse";

export const runtime = "nodejs";
export const revalidate = 600;

/** Premium features whose adoption trend we chart. All lack `Environment`, so
 *  they must be queried on "All" (see the pillar-env caveat). */
const PREMIUM_EVENTS = ["Workspace Chat Sent", "Form Emailed Successfully", "Redaction Created", "AI Forms Filled Successfully"];

// ~7 months of daily data so that, after getEventTrend drops the current
// still-incomplete month, six whole-ish months remain for the sparklines.
const TREND_DAYS = 210;

export async function GET() {
  try {
    const window = trailingWindow(TREND_DAYS, 0);
    const settled = await Promise.allSettled(
      PREMIUM_EVENTS.map((event) => getEventTrend(window, { event, env: "All" })),
    );
    const series: TrendSeries[] = settled
      .filter((r): r is PromiseFulfilledResult<TrendSeries> => r.status === "fulfilled")
      .map((r) => r.value);
    const body: TrendsResponse = { series, window: TREND_DAYS };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
