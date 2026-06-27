import { NextRequest, NextResponse } from "next/server";

import { getAgencyTotals, getAgencyWeeklySeries } from "@/lib/amplitude";
import {
  computeHealth,
  HEALTH_DEFAULTS,
  type HealthEnrichment,
  type HealthResponse,
} from "@/lib/health";
import { generateBrief } from "@/lib/brief";
import { trailingWindow } from "@/lib/query";
import { errorResponse } from "@/lib/route-helpers";
import type { StateDeptTotal } from "@/lib/amplitude-parse";
import type { Environment, Metric } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 600;

const EVENT = "New Question Asked"; // the product's value event (full State coverage)
const QUALITY_EVENT = "Better Answer Clicked"; // implicit answer-dissatisfaction signal

/** Index per-(state,department) totals by the `state|department` enrichment key. */
function totalsByKey(rows: StateDeptTotal[]): Map<string, number> {
  return new Map(rows.map((t) => [`${t.state}|${t.department}`, t.total]));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const metric: Metric = sp.get("metric") === "uniques" ? "uniques" : "totals";
    const env: Environment = sp.get("env") === "All" ? "All" : "Prod";
    const hideTest = sp.get("hideTest") !== "0"; // default ON
    const stateFilter = sp.get("state")?.trim() || null;

    // The board's must-haves (current/prior totals + weekly trend) go first.
    const curWindow = trailingWindow(30, 0);
    const [current, prior, seriesR] = await Promise.all([
      getAgencyTotals(curWindow, { event: EVENT, metric, env }),
      getAgencyTotals(trailingWindow(30, 30), { event: EVENT, metric, env }),
      getAgencyWeeklySeries(trailingWindow(84, 0), { event: EVENT, env, weeks: 12 }).catch(
        () => undefined,
      ),
    ]);

    // Secondary signals (active officers, answer-quality friction) run in a
    // SEPARATE, smaller batch so a cold-cache concurrency spike can't make
    // Amplitude throttle them out. allSettled → the board never blocks on these.
    const [officersR, betterR] = await Promise.allSettled([
      getAgencyTotals(curWindow, { event: EVENT, metric: "uniques", env, role: "officer" }),
      getAgencyTotals(curWindow, { event: QUALITY_EVENT, metric: "totals", env }),
    ]);
    const enrichment: HealthEnrichment = {
      series: seriesR,
      activeOfficers: officersR.status === "fulfilled" ? totalsByKey(officersR.value) : undefined,
      betterAnswers: betterR.status === "fulfilled" ? totalsByKey(betterR.value) : undefined,
    };

    const { agencies, summary } = computeHealth(
      current,
      prior,
      { ...HEALTH_DEFAULTS, hideTest },
      enrichment,
    );

    // Summary + brief always reflect the full picture; state only narrows rows.
    const rows = stateFilter ? agencies.filter((a) => a.state === stateFilter) : agencies;

    const body: HealthResponse = {
      agencies: rows,
      summary,
      brief: generateBrief(summary),
    };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
