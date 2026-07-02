import { NextRequest, NextResponse } from "next/server";

import { getAgencyTotals } from "@/lib/amplitude";
import {
  buildAccountInputs,
  computeIntelligence,
  INTELLIGENCE_DEFAULTS,
  type IntelligenceSignals,
} from "@/lib/intelligence";
import { trailingWindow } from "@/lib/query";
import { errorResponse } from "@/lib/route-helpers";
import type { StateDeptTotal } from "@/lib/amplitude-parse";
import type { Environment } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 600;

/** The product's value event — full State coverage, drives the momentum spine
 *  and the Ask pillar. */
const VALUE_EVENT = "New Question Asked";

/** One signature event per sold/valued product pillar (Ask = the value event).
 *  Documents = PDF/report work; Workspace = analysis; Redaction = marquee sold
 *  feature; Compliance = the sign-off + notification acknowledgment loop. */
const DOCUMENTS_EVENT = "PDF Loaded";
const WORKSPACE_EVENT = "Workspace Chat Sent";
const REDACTION_EVENT = "Redaction Created";
const SIGNOFF_EVENT = "Signoff Task Reviewed";
const NOTIFICATION_EVENT = "Notification Opened";
/** Implicit answer-quality / friction signals. */
const BETTER_ANSWER_EVENT = "Better Answer Clicked";
const DOWNVOTE_EVENT = "Card Downvoted";
/** Realization — outcomes shipped (delivered work products, the ROI story).
 *  These are the differentiated, high-value steps that live data shows are
 *  under-realized relative to raw Q&A volume. None carry `Environment`. */
const AI_FORM_FILLED_EVENT = "AI Forms Filled Successfully";
const FORM_EMAILED_EVENT = "Form Emailed Successfully";
const ARTIFACT_EXPORTED_EVENT = "Artifact Exported";

/**
 * Pillar / Forms events do NOT carry the `Environment` property, so an
 * `Environment=Prod` filter silently zeros them (verified against live data).
 * Query them on "All" and rely on the `hideTest` department filter for hygiene.
 * Chat events (the value event, Better Answer, Card Downvoted) DO carry it, so
 * those stay on the requested env to match the Health board.
 *
 * Activation/time-to-value is intentionally omitted as a per-account lens for
 * now: `Successful First LogIn` is too sparse at the 30-day department grain
 * (and its Environment coverage is unverified). It's reported as a global
 * funnel stat instead; the scoring engine reweights cleanly over its absence.
 */
const ENVLESS: Environment = "All";

/** Preset comparison windows (days). The board compares a trailing window
 *  against the prior equal-length window, so 30 = month-over-month, 90 =
 *  quarter-over-quarter. Kept in sync with the client's WINDOW_OPTIONS. */
const WINDOW_DAYS = [30, 90] as const;
const DEFAULT_WINDOW = 30;

function parseWindow(v: string | null): number {
  const n = Number(v);
  return (WINDOW_DAYS as readonly number[]).includes(n) ? n : DEFAULT_WINDOW;
}

const settledValue = (
  r: PromiseSettledResult<StateDeptTotal[]>,
): StateDeptTotal[] | undefined => (r.status === "fulfilled" ? r.value : undefined);

/** Sum two per-(state,department) totals lists — used to fuse sign-offs +
 *  notifications into the Compliance pillar. Returns undefined only if both ran
 *  and failed (so a single fulfilled batch still contributes). */
function mergeTotals(
  a: StateDeptTotal[] | undefined,
  b: StateDeptTotal[] | undefined,
): StateDeptTotal[] | undefined {
  if (!a && !b) return undefined;
  const m = new Map<string, StateDeptTotal>();
  for (const r of [...(a ?? []), ...(b ?? [])]) {
    const key = `${r.state}|${r.department}`;
    const ex = m.get(key);
    if (ex) ex.total += r.total;
    else m.set(key, { state: r.state, department: r.department, total: r.total });
  }
  return [...m.values()];
}

/**
 * Run async tasks with a concurrency cap (keeps Amplitude from rate-limiting a
 * burst of segmentation calls). Never rejects — mirrors Promise.allSettled, in
 * input order.
 */
async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      try {
        results[idx] = { status: "fulfilled", value: await tasks[idx]() };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const env: Environment = sp.get("env") === "All" ? "All" : "Prod";
    const hideTest = sp.get("hideTest") !== "0"; // default ON
    const stateFilter = sp.get("state")?.trim() || null;
    const windowDays = parseWindow(sp.get("window"));

    const cur = trailingWindow(windowDays, 0);
    const prev = trailingWindow(windowDays, windowDays);

    // Must-haves: the momentum spine (current vs prior question totals). If these
    // fail the board can't render, so they throw out to errorResponse.
    const [current, prior] = await Promise.all([
      getAgencyTotals(cur, { event: VALUE_EVENT, metric: "totals", env }),
      getAgencyTotals(prev, { event: VALUE_EVENT, metric: "totals", env }),
    ]);

    // Secondary lenses (breadth, trust, activation) run in a SEPARATE allSettled
    // batch so a cold-cache throttle on any one never blocks the board; a missing
    // batch simply leaves that lens null for every account.
    const settled = await runLimited(
      [
        () => getAgencyTotals(cur, { event: DOCUMENTS_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: WORKSPACE_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: REDACTION_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: SIGNOFF_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: NOTIFICATION_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: BETTER_ANSWER_EVENT, metric: "totals", env }),
        () => getAgencyTotals(cur, { event: DOWNVOTE_EVENT, metric: "totals", env }),
        () => getAgencyTotals(cur, { event: AI_FORM_FILLED_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: FORM_EMAILED_EVENT, metric: "totals", env: ENVLESS }),
        () => getAgencyTotals(cur, { event: ARTIFACT_EXPORTED_EVENT, metric: "totals", env: ENVLESS }),
      ],
      3,
    );

    const signals: IntelligenceSignals = {
      current,
      prior,
      documents: settledValue(settled[0]),
      workspace: settledValue(settled[1]),
      redaction: settledValue(settled[2]),
      compliance: mergeTotals(settledValue(settled[3]), settledValue(settled[4])),
      betterAnswers: settledValue(settled[5]),
      downvotes: settledValue(settled[6]),
      formsAiFilled: settledValue(settled[7]),
      formsEmailed: settledValue(settled[8]),
      artifactsExported: settledValue(settled[9]),
      signoffs: settledValue(settled[3]), // sign-offs also feed value-delivered
    };

    const { accounts, summary, featureTotals } = computeIntelligence(buildAccountInputs(signals), {
      ...INTELLIGENCE_DEFAULTS,
      hideTest,
      // The floor is a minimum *absolute* prior-window volume, so it must scale
      // with the window or a longer window would mark far fewer accounts "no-read".
      floor: Math.round(INTELLIGENCE_DEFAULTS.floor * (windowDays / DEFAULT_WINDOW)),
    });

    // Pillars whose fetch failed must read as "—", not "0% adopted".
    const unavailablePillars = [
      settled[0].status === "fulfilled" ? null : "documents",
      settled[1].status === "fulfilled" ? null : "workspace",
      settled[2].status === "fulfilled" ? null : "redaction",
      settled[3].status === "fulfilled" || settled[4].status === "fulfilled" ? null : "compliance",
    ].filter((p): p is string => p !== null);

    // Summary always reflects the full book; an optional state only narrows rows.
    const rows = stateFilter ? accounts.filter((a) => a.state === stateFilter) : accounts;
    return NextResponse.json({ accounts: rows, summary, featureTotals, unavailablePillars, window: windowDays });
  } catch (err) {
    return errorResponse(err);
  }
}
