import { NextRequest, NextResponse } from "next/server";

import { getAgencyTotals } from "@/lib/amplitude";
import { computeHealth, HEALTH_DEFAULTS, type HealthResponse } from "@/lib/health";
import { generateBrief } from "@/lib/brief";
import { trailingWindow } from "@/lib/query";
import { errorResponse } from "@/lib/route-helpers";
import type { Environment, Metric } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 600;

const EVENT = "New Question Asked"; // the product's value event (full State coverage)

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const metric: Metric = sp.get("metric") === "uniques" ? "uniques" : "totals";
    const env: Environment = sp.get("env") === "All" ? "All" : "Prod";
    const hideTest = sp.get("hideTest") !== "0"; // default ON
    const stateFilter = sp.get("state")?.trim() || null;

    const [current, prior] = await Promise.all([
      getAgencyTotals(trailingWindow(30, 0), { event: EVENT, metric, env }),
      getAgencyTotals(trailingWindow(30, 30), { event: EVENT, metric, env }),
    ]);

    const { agencies, summary } = computeHealth(current, prior, {
      hideTest,
      ...HEALTH_DEFAULTS,
    });

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
