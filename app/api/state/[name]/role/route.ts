import { NextRequest, NextResponse } from "next/server";

import { getBreakdown } from "@/lib/amplitude";
import { decodeStateName, errorResponse, parseQuery } from "@/lib/route-helpers";

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
    const body = await getBreakdown({ ...q, state, dimension: "UserGroup" });
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
