# Design Memory — Blue Voice geo / Account Health

Durable design decisions for this app. Update as the system evolves.

## Brand tone
- **Adjectives:** striking, premium, trustworthy, data-dense. Beyond tables/line charts where it earns its keep.
- **Avoid:** 50 equal-weight tiles; counts without a normalized twin (MA ≈ 48% of volume swamps everyone); color used as decoration.

## Color
- shadcn/ui **new-york**, slate baseColor, **Blue Voice navy** primary (`oklch(0.208 0.042 265.755)`). Tokens in `app/globals.css`.
- **Health is the ONE diverging channel:** red `#e5484d` → amber `#d9930a` → emerald `#2bb673`. All of it lives in `components/health/viz.ts` (`healthColor`, `scoreRamp`, `bandOf`; bands: <45 red, <68 amber, ≥68 green). Everything structural stays on CSS tokens (`bg-card`, `text-muted-foreground`, `border`…) so light/dark both work. Never hardcode slate/gray hexes for data.
- The volume map (`lib/states.ts`) stays **monochrome slate** (sqrt scale); the *health* cartogram re-lights the same tile grid with `scoreRamp`. Two different jobs, two different ramps.

## Layout & motion
- Comfortable density. KPI row + State/Status filters + AI brief are the shared chrome; the views are tabs beneath.
- **Tabs over one data source:** the 5 views are lenses on the same `AgencyHealth[]`; one fetch + `filterAgencies` feeds all. Only the active tab mounts (charts are heavy).
- All entrance/hover motion is gated behind `motion-safe:` / `prefers-reduced-motion: no-preference`. Pulsing/glow must be static under reduced motion.
- Numbers use `tabular-nums`. `fmt`/`fmtCompact`/`fmtPct` from `lib/format`.

## Account Health Board (shipped)
- Target: `components/HealthBoard.tsx` (tabbed). Views in `components/health/`: `Screener`, `RiskQuadrant`, `Cartogram`, `Treemap`, `CallList`. Shared viz in `components/health/viz.ts`.
- **Principle that drove the redesign:** encode the *decision* (which account to call, and why), not the metric. → ranked screener w/ micro-charts, risk quadrant, health cartogram, book-of-business treemap, beeswarm+slopegraph call-list. None are bare line charts.
- Each view takes `{ rows: AgencyHealth[] }` and must **degrade gracefully** when optional enrichment is absent (show "—", never fabricate).

## Data contract (`lib/health.ts` + `/api/health`)
- `AgencyHealth`: always `department, state, usps, current, prior, deltaAbs, deltaPct (number|null), status, score`. Optional enrichment: `series` (12 weekly), `activeOfficers`, `betterAnswerRate`, `provisionedOfficers`, `breadth`.
- `computeHealth(current, prior, opts, enrichment?)` — 4th arg optional (keeps the 11 base unit tests intact). `computeScore` weight-normalizes over **whichever** signals are present (trend 45 / breadth 30 / quality 25).
- Route fetches in two batches (must-haves: current/prior/series; secondary: officer-uniques + Better-Answer) so a cold-cache concurrency spike can't make Amplitude throttle the secondary signals out. `allSettled` → the board never blocks on enrichment.
- **Known coverage:** series ~100% of agencies, active-officers ~88%, answer-quality ~18% (Better-Answer-Clicked is genuinely sparse). `breadth` is undefined until a **provisioned-seats** source exists — that's the main follow-up.

## Repo conventions
- Next.js 16 App Router, Tailwind v4, shadcn primitives in `components/ui`. Pure logic in `lib/*` is unit-tested (`lib/__tests__`); presentational smoke tests in `components/__tests__`.
- Folders prefixed `_`/`__` are **private** in App Router (no route) — name temporary routes without underscores.

*Last updated by the Account Health Board redesign (tabbed, 5 advanced-viz views).*
