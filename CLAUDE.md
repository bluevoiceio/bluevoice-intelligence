# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev            # next dev → http://localhost:3000
npm run build          # next build (a stray client import of server-only code fails here)
npm run lint           # eslint (next/core-web-vitals + next/typescript)
npm test               # vitest run (all unit + smoke tests)
npm run test:watch     # vitest watch mode

npx vitest run lib/__tests__/intelligence.test.ts   # single test file
npx vitest run -t "value delivered"                 # single test by name
```

Vitest only picks up `lib/**/*.test.ts` and `components/**/*.test.tsx` (see `vitest.config.ts`); it runs in the `node` environment, and the `@/*` alias is wired in both `tsconfig.json` and the vitest config.

## What this app is

An internal Blue Voice analytics tool over **Amplitude** (project `Blue Voice App`, appId `602375`). The browser never sees Amplitude credentials — all upstream calls go through Next.js route handlers (`app/api/**`, Node runtime) that hold the API key/secret. Data works at the **department/state grain only** (officer logs are intentionally anonymous).

One top-level view, rendered by `components/AppView.tsx`:

- **Account Intelligence** (`components/intelligence/IntelConsole.tsx`, served by `/api/intelligence` + `/api/trends`) — a company-narrative briefing over the same *account-as-the-row* health data. Every department still gets a 0–100 **health** score, banded red/yellow/green, from four **engagement** signals — **Usage** (activity level ranked vs the book), **Trend** (month-over-month direction), **Answer quality** (friction/re-asks), **Feature adoption** — blended with a weighted **geometric** mean so one weak signal drags the score down. **Value delivered** (outcomes shipped: forms, exports, redactions, sign-offs) is scored peer-relative and shown as expansion *upside*, not health. The board opens with a **Cover** (a data-guarded thesis + verdict line, headline stats) and reads as three acts — **01 Where we stand** (national tile cartogram + treemap + Lorenz `ConcentrationCurve` showing state concentration), **02 Which way we're moving** (`MomentumLedger`, `MoversSlope` riser/faller slopegraph, `HealthDistribution` histogram), **03 Where the upside is** (`RealizationGap` adoption funnel, `WhitespaceMatrix`, `AdoptionTrend` premium-feature sparklines) — with a per-account focus card (radial glyph + "next play" recommendation) on hover.

This view replaced an earlier two-tab board (a CS "Health" dashboard and a US choropleth "Explorer"); their files and the `/api/health` + `/api/geo` routes are gone. A prior single-narrative cut of this board (beeswarm `Constellation` + adoption×usage `LensQuadrant`) was itself replaced by the Cover+three-acts briefing described above; those two components are deleted.

## Architecture

```
Client components ──fetch /api/*──▶ Route handler (Node, holds AMPLITUDE_*_KEY) ──Basic auth──▶ Amplitude Dashboard REST API
                   (React Query)      (runtime="nodejs", revalidate=600)              /api/2/events/segmentation
```

The server code is split into a **credentialed I/O layer** and a **pure layer**, and this separation is the main thing to preserve:

- `lib/amplitude.ts` — **server-only** (`import "server-only"`). Builds Basic auth + does the segmentation fetch (`getAgencyTotals`) and, for the briefing's trend act, a daily-bucketed fetch (`getEventTrend`, used by `/api/trends`). Never import it (transitively) from a client component; the build will fail. Throws `AmplitudeConfigError` (→ 500) / `AmplitudeUpstreamError` (→ 502).
- `lib/amplitude-parse.ts` — **pure** parsing/aggregation, no I/O, unit tested. The segmentation response shape varies by group-by depth; the parser tolerates the documented variants. Also has `bucketDailyToMonthly` and the `TrendSeries`/`TrendsResponse` shapes consumed by `/api/trends`. **Lock parser changes against real shapes** by setting `AMPLITUDE_DEBUG=1` to log one raw response.
- `lib/intelligence.ts` — **pure** account-health logic (no I/O, heavily unit tested in `lib/__tests__/intelligence.test.ts`). `buildAccountInputs` joins the per-signal segmentation batches into one `AccountInput` per (state, department); `computeIntelligence` scores each account — the four engagement lenses plus peer-relative value-delivered — into a `LensScores` set, a 0–100 `composite` via `weightedGeoMean` (floored so a single zero lens drags hard without annihilating the score), and a band via the exported **`bandFor`** (the single source of truth: green ≥66 / yellow / red <40). `recommend()` turns an account's weakest lens into a prescriptive "next play". `sumFeatureTotals` rolls the raw signals into book-wide `FeatureTotals` (documents, questions, signoffs, workspace, formsEmailed, aiFormsFilled, artifactsExported, redaction) that feed the Act 3 realization funnel. Weights, the value-delivered percentile, and the band thresholds are **reasoned defaults** — calibrate against known healthy/at-risk accounts before trusting any single score.
- `lib/charts.ts` — **pure** chart-data transforms for the bespoke SVG visuals (no React/DOM/I/O, unit tested in `lib/__tests__/charts.test.ts`): `sumByState`, `topShare`, `lorenzPoints` (the concentration curve), `histogramBuckets`, `topMovers`, `funnelBars`, `sparklinePath`.
- `lib/narrative.ts` — **pure**, deterministic (no LLM) narration engine for the Cover + three acts, unit tested in `lib/__tests__/narrative.test.ts`. `deriveSignals` reduces the intelligence + trend responses into a `BookSignals` summary; `selectThesis` picks the first data-guarded rule that fires (softening book → under-realized adoption → broad momentum → neutral fallback) so the headline always reflects what the guard actually supports; `buildNarrative` assembles the full `Narrative` (thesis, verdict, cover stats, three act captions, top risers/fallers) consumed by `IntelConsole`.
- `lib/route-helpers.ts` — shared query parsing (`parseQuery`), the `BadRequest` error, and `errorResponse()` that maps error classes to status codes. Reuse these in any new route.
- `lib/query.ts` — the trailing-window date math (`trailingWindow`, `rangeToDates`) and the `TEST_DEPT_RE` / `isTestDepartment` test/demo department filter.

### Conventions to follow

- **Route handlers** declare `export const runtime = "nodejs"` and `export const revalidate = 600`. This 10-min upstream cache is mirrored on the client by React Query's `staleTime` (≈5 min, `app/providers.tsx`) — keep them roughly in sync if you change one.
- **Two cache layers** exist by design (route `revalidate` + React Query). Don't add a third without a reason.
- **Amplitude dates** are always `YYYYMMDD` formatted in `America/New_York` (`lib/query.ts`) — never use raw `Date` ISO strings for upstream calls.
- **Test/demo departments** are filtered via `TEST_DEPT_RE` / `isTestDepartment` (default on, `hideTest`). Apply the same filter anywhere you surface agency-grain data — and compute any **peer-relative** score (activity rank, value-delivered percentile) over the *filtered* book so the reference isn't skewed by demo accounts.
- **Resilient fan-out:** `/api/intelligence` runs the must-have momentum spine (`Promise.all` on current + prior `New Question Asked` totals) first, then the secondary signals (pillars, friction, outcomes, sign-offs) in a concurrency-capped `runLimited` batch, so a cold-cache throttle on a nice-to-have never blocks the board. A missing batch simply leaves that lens null and the composite reweights over whatever is present. Follow this pattern for non-essential signals.
- **Pillar/outcome events lack `Environment`:** some events (forms, workspace, redaction, sign-off) do NOT carry the `Environment` property, so an `Environment=Prod` filter silently zeros them (verified against live data) — query those on `"All"` and rely on `hideTest` for hygiene. Chat events (the value event, friction signals) DO carry it and stay on the requested env.
- **Data-coverage caveat:** `State` is only reliably populated on a subset of events. The board is built on `New Question Asked`, which has full coverage and drives both the momentum spine and the Usage signal — don't swap in a low-coverage event without checking.

### Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 + shadcn/ui (new-york, `components/ui/*`) · TanStack React Query v5 · `next-themes` (class-based dark mode) · Vitest. The visualizations in `components/intelligence/*` are **bespoke SVG**, using `d3-scale` for scales only: the thesis `Cover`, a tile-grid state cartogram (`IntelMap`), squarified treemap (`IntelTreemap`), Lorenz `ConcentrationCurve`, `MomentumLedger`, riser/faller `MoversSlope` slopegraph, `HealthDistribution` histogram, adoption `RealizationGap` funnel, `WhitespaceMatrix`, premium-feature `AdoptionTrend` sparklines, `AccountFocus`/`AccountHoverCard`, the band `BandArc`, and the radial health glyph (`LensGlyph` + the pure geometry/colour helpers in `lens.ts`). (`react-simple-maps`, `us-atlas`, `recharts` remain in `package.json` from the retired choropleth/health board but are no longer imported.)

## Environment

Server-only env (never `NEXT_PUBLIC_`): `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`, `AMPLITUDE_BASE_URL` (`https://amplitude.com`, US data center). Copy `.env.local.example` → `.env.local`. Optional `AMPLITUDE_DEBUG=1` logs one raw segmentation response.

Sanity check after setting keys (small drift expected as the trailing window rolls):

```bash
curl 'http://localhost:3000/api/intelligence?hideTest=1' | jq '.summary'
# ~ { "total": 216, "bands": { "green": 48, "yellow": 129, "red": 39 } }
```
