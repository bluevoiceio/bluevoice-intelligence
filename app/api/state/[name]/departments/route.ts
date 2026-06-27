import { NextRequest, NextResponse } from "next/server";

import { getBreakdown } from "@/lib/amplitude";
import { isTestDepartment } from "@/lib/query";
import { decodeStateName, errorResponse, parseQuery } from "@/lib/route-helpers";
import type { BreakdownResponse } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const state = decodeStateName(name);
    const q = parseQuery(req.nextUrl.searchParams);

    const result = await getBreakdown({ ...q, state, dimension: "Department" });

    // Drop test/demo departments when requested (spec §6).
    const groups = q.hideTest
      ? result.groups.filter((g) => !isTestDepartment(g.key))
      : result.groups;

    const body: BreakdownResponse = {
      groups,
      total: groups.reduce((a, g) => a + g.total, 0),
    };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
