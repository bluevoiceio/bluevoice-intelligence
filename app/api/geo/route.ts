import { NextRequest, NextResponse } from "next/server";

import { getGeo } from "@/lib/amplitude";
import { errorResponse, parseQuery } from "@/lib/route-helpers";
import type { GeoResponse } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 600; // 10 min upstream cache (spec §3.5)

export async function GET(req: NextRequest) {
  try {
    const q = parseQuery(req.nextUrl.searchParams);
    const { byState, total, activeStates, untagged } = await getGeo(q);

    // "mostly (none)" → the event isn't reliably State-tagged (spec §4).
    const lowCoverage = untagged > 0 && untagged >= total;

    const body: GeoResponse = {
      byState,
      total,
      activeStates,
      untagged,
      lowCoverage,
    };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
