import { NextResponse } from "next/server";

import { EVENTS } from "@/lib/events";

// Static list — safe to cache aggressively.
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ events: EVENTS });
}
