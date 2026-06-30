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

npx vitest run lib/__tests__/health.test.ts   # single test file
npx vitest run -t "month-over-month"          # single test by name
```

Vitest only picks up `lib/**/*.test.ts` and `components/**/*.test.tsx` (see `vitest.config.ts`); it runs in the `node` environment, and the `@/*` alias is wired in both `tsconfig.json` and the vitest config.

## What this app is

An internal Blue Voice analytics tool over **Amplitude** (project `Blue Voice App`, appId `602375`). The browser never sees Amplitude credentials — all upstream calls go through Next.js route handlers (`app/api/**`, Node runtime) that hold the API key/secret. Data works at the **department/state grain only** (officer logs are intentionally anonymous).

Two top-level views, switched client-side in `components/AppView.tsx` (Health is the default):
- **Health** (`HealthBoard.tsx` + `components/health/*`) — a tabbed account-health dashboard built on `/api/health` (CS/renewal month-over-month agency deltas).
- **Explorer** (`Explorer.tsx`) — the US choropleth: pick an event, see it shaded by state, drill into a state's departments / device / role / trend.

## Architecture

```
Client components ──fetch /api/*──▶ Route handler (Node, holds AMPLITUDE_*_KEY) ──Basic auth──▶ Amplitude Dashboard REST API
                   (React Query)      (runtime="nodejs", revalidate=600)              /api/2/events/segmentation
```

The server code is split into a **credentialed I/O layer** and a **pure layer**, and this separation is the main thing to preserve:

- `lib/amplitude.ts` — **server-only** (`import "server-only"`). Builds Basic auth + does the segmentation fetch. Never import it (transitively) from a client component; the build will fail. Throws `AmplitudeConfigError` (→ 500) / `AmplitudeUpstreamError` (→ 502).
- `lib/amplitude-parse.ts` — **pure** parsing/aggregation, no I/O, unit tested. The segmentation response shape varies by group-by depth; the parser tolerates the documented variants. **Lock parser changes against real shapes** by setting `AMPLITUDE_DEBUG=1` to log one raw response.
- `lib/health.ts` — **pure** CS-health logic: joins two trailing windows of per-(state,department) totals into MoM deltas, classifies (`decliner`/`riser`/`new`/`stable`), attaches optional enrichment (weekly series, active officers, answer-quality), scores 0–100. Unit tested.
- `lib/brief.ts` — **deterministic templated** weekly brief (no LLM). The richer narrative is produced on demand by Claude Code, not at runtime.
- `lib/route-helpers.ts` — shared query parsing (`parseQuery`), the `BadRequest` error, and `errorResponse()` that maps error classes to status codes. Reuse these in any new route.
- `lib/query.ts` — the `Filters` model (also persisted to localStorage on the client), `buildApiQuery`, `rangeToDates`/`trailingWindow`, and the `TEST_DEPT_RE` test/demo department filter.

### Conventions to follow

- **Route handlers** declare `export const runtime = "nodejs"` and `export const revalidate = 600`. This 10-min upstream cache is mirrored on the client by React Query's `staleTime` (≈5 min) in `app/providers.tsx` — keep them roughly in sync if you change one.
- **Two cache layers** exist by design (route `revalidate` + React Query). Don't add a third without a reason.
- **Amplitude dates** are always `YYYYMMDD` formatted in `America/New_York` (`formatAmplitudeDate` in `lib/query.ts`) — never use raw `Date` ISO strings for upstream calls.
- **Test/demo departments** are filtered via `TEST_DEPT_RE` / `isTestDepartment` (default on, `hideTest`). Apply the same filter anywhere you surface agency-grain data.
- **Resilient fan-out:** the health route runs must-have data (`Promise.all`) first, then secondary enrichment in a separate `Promise.allSettled` batch so a cold-cache throttle on the nice-to-haves never blocks the board. Follow this pattern for non-essential signals.
- **Data-coverage caveat:** `State` is only reliably populated on a subset of events. Map-ready events are the default; low-coverage events are gated behind "Show all events" and trigger an inline coverage warning (`lowCoverage`). Don't silently map an untagged event.

### Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 + shadcn/ui (new-york, `components/ui/*`) · TanStack React Query v5 · `react-simple-maps` + `us-atlas` + `d3-scale` for the map · `recharts` for charts · `next-themes` (class-based dark mode) · Vitest.

## Environment

Server-only env (never `NEXT_PUBLIC_`): `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`, `AMPLITUDE_BASE_URL` (`https://amplitude.com`, US data center). Copy `.env.local.example` → `.env.local`. Optional `AMPLITUDE_DEBUG=1` logs one raw segmentation response.

Sanity baseline after setting keys (small drift expected as the window rolls):

```bash
curl 'http://localhost:3000/api/geo?event=New%20Question%20Asked&metric=totals&range=90d&env=Prod' | jq '.byState'
# ~ Massachusetts 17702, New Jersey 4003, Texas 3331, Florida 2456 ...
```
