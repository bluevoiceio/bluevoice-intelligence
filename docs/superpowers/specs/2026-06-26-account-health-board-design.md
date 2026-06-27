# Account Health Board — Design Spec

**Date:** 2026-06-26
**Status:** Approved for planning
**Author:** Ninad + Claude Code

## 1. Purpose

Turn `bluevoice-geo` from a "where is usage" choropleth (a nice-to-have) into a
"who do I call this week" tool (a must-have) for Customer Success / renewal
health. The new **Account Health Board** ranks Blue Voice agencies by their
**month-over-month change in question volume** (`New Question Asked`), surfacing
declining agencies as a CS call-list and fast-rising / newly-activated agencies
as expansion and case-study signals — with a plain-English **Weekly Territory
Brief** on top.

This is the entry for **this week's** internal Claude contest, so scope is
deliberately tight: an additive view on the existing app, no new external
dependencies.

### Why this is the right shape (validated, not assumed)

Live Amplitude data (2026-06-26, trailing 30d vs prior 30d, Prod) confirms the
play:

- **Usage is ~86% concentrated in 5 states** (Massachusetts ~48%, NJ ~12%,
  TX ~10%, CA ~8%, FL ~7%). A national choropleth spends most of its pixels on
  empty states — so **the agency, not the state, is the unit that matters**, and
  state becomes a filter rather than the canvas.
- **Real, large MoM swings are invisible at the state grain:** decliners like
  La Vista City PD (349→214, −39%), Castle Rock PD (334→203, −39%), Palm Beach
  PD (307→215, −30%), Jefferson County SO (218→140, −36%); risers/activations
  like Clovis PD (38→633) and Lakewood (1→450). None of these are visible on a
  this-month choropleth.

See memory `contest-direction-account-health` and
`usage-concentration-and-data-grain` for the full reasoning.

## 2. Scope

### In scope (this week)
- New **Health view** as the default landing view; existing Explorer remains one
  toggle away.
- One new route handler computing agency MoM deltas.
- One pure, unit-tested module for the delta/classification logic.
- One deterministic templated brief generator.
- One new board component, reusing the existing drill-down and UI primitives.

### Explicitly out of scope (later weekly entries / YAGNI now)
- Live Anthropic API call in the deployed website. **The website ships a
  deterministic templated brief.** The "AI analyst" narrative is delivered by
  **Claude Code** (this MCP-connected workflow) generating a richer brief on
  demand — no `ANTHROPIC_API_KEY` in the app, no per-request LLM cost, no
  in-app failure mode.
- Expansion (seats-vs-usage), whitespace/marketing-adjacency, and
  feature-adoption maps. These are future weeks.
- Any change to the anonymity model: the board works at **department/state grain
  only**, never individual-officer grain (unchanged from the existing app).

## 3. Architecture

Purely additive — no existing file is deleted, no existing behavior changes.

```
components/HealthBoard.tsx ──fetch /api/health?…──▶ app/api/health/route.ts
  · Weekly Territory Brief banner                     · runtime=nodejs, revalidate=600
  · KPI strip (totals, # at-risk, top-5 share)        · pulls TWO windows via lib/amplitude
  · ranked agency table (state + status filters)         (current 30d, prior 30d), Prod
  · row click → existing <StateDrilldown>             ▼
                                              lib/health.ts (pure, unit-tested)
                                                join(current, prior) → deltas
                                                classify · volume floor · exclude test depts
                                                       │
                                              lib/brief.ts  generateBrief(summary) → string
                                                deterministic template
```

### Data flow
1. `HealthBoard` calls `GET /api/health?metric=totals&env=Prod&hideTest=1[&state=…]`.
2. The route fetches **two 30-day windows** of `New Question Asked` segmented by
   `["State","Department"]` (current: now−30d→now; prior: now−60d→now−30d),
   reusing the same server-only Amplitude client and 2-level segmentation parsing
   that `getBreakdown` already uses.
3. `lib/health.ts` joins the two windows by department, computes deltas,
   classifies each agency, applies the volume floor and test-department
   exclusion, and produces the ranked list + summary aggregates.
4. `lib/brief.ts` renders the summary into a short English paragraph.
5. The route returns `{ agencies, summary, brief, coverage }`; React Query caches
   it client-side (matching existing hook patterns).

## 4. New / changed modules

### 4.1 `lib/amplitude.ts` (add one function)
Add `getAgencyTotals(window, opts)`:
- Input: a `{ start, end }` YYYYMMDD window + `{ env, metric }`.
- Calls `segmentation` with `groupBy: ["State", "Department"]`.
- Returns `StateDeptTotal[]` = `{ state: string; department: string; total: number }`
  using the existing 2-level parse path (same as `getBreakdown`). A department
  appearing under `(none)` state keeps `state: "(none)"`.
- No new auth/transport code — reuses everything in this module.

### 4.2 `lib/query.ts` (add window helper)
Add `trailingWindow(days: number, offsetDays = 0): { start: string; end: string }`
producing YYYYMMDD bounds in `America/New_York` (reusing the existing
`formatAmplitudeDate`). Current window = `trailingWindow(30, 0)`; prior window =
`trailingWindow(30, 30)`. The current incomplete day is naturally excluded by
using `end = today` with daily buckets; the route requests both windows so the
comparison is like-for-like.

### 4.3 `lib/health.ts` (new, pure, unit-tested)
```ts
export type HealthStatus = "decliner" | "riser" | "new" | "stable";

export interface AgencyHealth {
  department: string;
  state: string;        // full state name, or "(none)"
  current: number;
  prior: number;
  deltaAbs: number;     // current - prior
  deltaPct: number | null; // null when prior == 0 (new agency)
  status: HealthStatus;
}

export interface HealthSummary {
  totalCurrent: number;
  totalPrior: number;
  atRiskCount: number;        // # decliners passing thresholds
  risingCount: number;
  newCount: number;
  topDecliners: AgencyHealth[]; // up to 5, by |deltaAbs|
  topRisers: AgencyHealth[];    // up to 5
  topStateShare: { state: string; pct: number }[]; // top 5 states by current
}

export function computeHealth(
  current: StateDeptTotal[],
  prior: StateDeptTotal[],
  opts: { hideTest: boolean; floor: number; declinePct: number; risePct: number },
): { agencies: AgencyHealth[]; summary: HealthSummary };
```

**Classification rules (defaults; centralized as named constants):**
- `floor = 50` — minimum **prior**-window volume for an agency to be eligible for
  `decliner` (keeps `5→2` noise out of the call-list).
- `decliner`: `prior >= floor` AND `deltaPct <= -declinePct` (`declinePct = 25`).
- `riser`: `prior >= floor` AND `deltaPct >= risePct` (`risePct = 25`).
- `new`: `prior < floor` AND `current >= floor` → "New / Activated" (e.g.
  Lakewood 1→450). Never reported as a percentage.
- `stable`: everything else.
- Ranking: decliners and risers sorted by `|deltaAbs|` (absolute volume ≈ best
  available proxy for revenue at risk / expansion size).
- Test/demo departments removed up front via the existing
  `isTestDepartment` / `TEST_DEPT_RE` from `lib/query.ts` when `hideTest` is true.
  **Extend `TEST_DEPT_RE`** to also match `evaluation|interns|inactive` — the
  current pattern (`test|e2e|demo|qa-|sandbox|red voice`) misses real non-customer
  rows seen in the data (`JAM Evaluation Police`, `Interns Department`,
  `Z INACTIVE Michigan State Police`). This also cleans the existing Explorer's
  department drill-down (same helper), a small in-scope improvement. Re-run the
  existing `lib.test.ts` cases for the regex after extending.
- **Key each agency by `(state, department)`.** In the Blue Voice model one
  agency maps to exactly one state, so the same department name under two
  different states is two *different* agencies and must never be merged (law-
  enforcement town names collide constantly — Lakewood, Franklin, Springfield).
  Rows whose `State` is `(none)` (untagged) are excluded from the board, mirroring
  the choropleth's untagged-exclusion; `State` is reliably populated on
  `New Question Asked`, so this drops negligible volume. (Decision 2026-06-26,
  reversing an earlier "fold to dominant state" draft, which would have merged
  distinct same-named agencies.)

### 4.4 `lib/brief.ts` (new, deterministic)
```ts
export function generateBrief(summary: HealthSummary): string;
```
Pure template, no LLM. Produces e.g.:
> "8 agencies need attention this week. Biggest drops: La Vista City PD (−39%),
> Castle Rock PD (−39%), Palm Beach PD (−30%). Two activations are ramping fast —
> Clovis PD and Lakewood. Massachusetts remains ~half of all usage (48%)."
Handles empty cases gracefully ("No agencies crossed the decline threshold this
period.").

### 4.5 `app/api/health/route.ts` (new)
- `export const runtime = "nodejs"; export const revalidate = 600;`
- Reads `metric`, `env`, `hideTest`, optional `state` via the existing
  `parseQuery` helper (extend it only if needed for `state` passthrough).
- Computes both windows, calls `computeHealth` + `generateBrief`.
- Optional `state` query param filters the returned `agencies` to one state
  (server-side) while `summary`/`brief` stay computed over all agencies (so the
  brief always reflects the full picture).
- Maps `AmplitudeConfigError`/`AmplitudeUpstreamError` via the shared
  `errorResponse` helper (same as existing routes).
- Response type `HealthResponse` added to `lib/types.ts`.

### 4.6 `lib/types.ts` (add)
`HealthResponse = { agencies: AgencyHealth[]; summary: HealthSummary; brief: string }`
(re-export `AgencyHealth`/`HealthSummary` from `lib/health.ts` or co-locate —
plan decides). Add a `view: "health" | "explorer"` concept for the top-level
toggle.

### 4.7 `components/HealthBoard.tsx` (new)
- **Brief banner** at top (from `summary.brief`), styled like a callout card.
- **KPI strip** reusing `<Kpi>`: total questions (30d), Δ vs prior, # at-risk
  agencies, top-5-state share.
- **Filters:** a single-select **State** dropdown (`All states` default, plus
  each active state) — this is the "state-specific view" the concentration data
  calls for; and a **Status** filter (All / At-risk / Rising / New).
- **Table** reusing `ui/table`: Agency · State · 30d · Prior · Δ% · Δ (with
  red/green `ui/badge` by status), sorted by `|deltaAbs|` with at-risk first.
- **Row click** → reuse existing `<StateDrilldown>` scoped to that agency's
  **state** for context. (v1 is state-scoped — no new agency-grain endpoint;
  agency-scoped drill-down is a later enhancement.)
- Loading via `ui/skeleton`; errors surfaced inline; `<CoverageNotice>` reused
  since `New Question Asked` is a full-coverage event (so no warning fires, but
  the component stays consistent).

### 4.8 `components/hooks.ts` (add) & `app/page.tsx` (toggle)
- Add `useHealth(filters)` React Query hook mirroring existing hooks + `fetchJson`.
- Add a top-level **Health | Explorer** toggle; **Health is the default**.
  Existing `Explorer` is unchanged behind the toggle.

## 5. Testing

- `lib/__tests__/health.test.ts` (Vitest, matches existing style):
  - join correctness (depts present in one window but not the other).
  - each classification branch (decliner / riser / new / stable) incl. the floor
    boundary and `prior == 0` (deltaPct null).
  - multi-state department folding → highest-volume state.
  - test-department exclusion honored / not honored by `hideTest`.
  - ranking by `|deltaAbs|`.
- `lib/__tests__/brief.test.ts`: brief renders expected sentences for a sample
  summary; empty-case copy.
- Reuse existing fixtures / parser tests for the Amplitude shape; no need to
  re-test transport.
- Manual sanity (keys now in `.env.local`): `GET /api/health` should rank
  Castle Rock PD and La Vista City PD among top at-risk for the current window
  (drift expected as the window rolls).

## 6. Risks & mitigations

- **Test-data pollution** (e.g. `TEST E2E Department` at 144/mo ranking in the
  top 25) → centralized exclusion on by default; the only must-fix for
  credibility.
- **Two API calls per load** (two windows) → both cached by `revalidate=600`
  upstream + the route's own revalidate + React Query; acceptable.
- **Small-agency noise** → volume floor on the decliner/riser classification.
- **New-agency math** (`÷0`) → `deltaPct = null`, `new` status, never shown as %.
- **Window edges** → both windows use the same `trailingWindow` helper so they're
  symmetric; document that the latest partial day is included identically in both
  (net-neutral for comparison).

## 7. Success criteria

- Health view loads as default, lists real agencies ranked by MoM Δ with test
  depts excluded, at-risk agencies clearly flagged.
- State dropdown narrows the board to a single state.
- Weekly Territory Brief reads as a coherent CS call-list summary.
- `npm run build`, `npm run lint` (zero-warning), and `npm run test` all pass;
  new logic covered by unit tests.
- Existing Explorer view still works unchanged.
