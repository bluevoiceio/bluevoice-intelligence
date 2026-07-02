# Account Intelligence → Company Narrative Briefing — Design

**Date:** 2026-07-02
**Status:** Design approved (visual companion), pending spec review → implementation plan
**Author:** Ninad + Claude (brainstorming session)

---

## 1. Summary

Reshape the single Account Intelligence view (`components/intelligence/IntelConsole.tsx`,
served by `/api/intelligence`) from a set of loosely-captioned panels into a **general
company narrative** — one cohesive, scrollable **executive briefing** that anyone at Blue
Voice can read top-to-bottom and come away understanding the state of the book and why.

The board keeps its strong scoring brain (`lib/intelligence.ts`) and most of its
visualizations, but reorganizes them under a **three-act narrative arc** with a persistent
**thesis cover**, adds the visuals that were missing, and — crucially — introduces a
**deterministic narration layer** (`lib/narrative.ts`) that carries the story in prose
computed from real numbers.

### The thesis

> **"Deep adoption, under-realized value."**

(Cover headline. The AI-edge nuance is carried by the verdict line beneath it and by Act 3,
not the headline itself.) **This is the thesis the *current* data selects — it is not a
constant.** The headline is chosen at runtime by data-guarded rules (see §5) and will change
if the situation changes; today's book resolves to "under-realized value."

Grounded in a live probe (project 602375, last 30 days): officers read **22,900 PDFs** and
ask **13,000 questions** a month, but the AI-differentiated premium actions the product is
sold on crater — **AI Forms 151, Artifact Exported 85, Redaction 79**. That gap is
simultaneously the retention risk and the growth runway. And it is not static: **Workspace
Chat has grown ~20× in six months** (56 → 1,223/mo), while **AI Forms is flat/stalled**.

### The narration constraint (decided)

- **No LLM.** The user has no Anthropic key and does not want one. All narration is
  **deterministic, template-driven prose** over computed facts. This is a feature, not a
  limitation: every sentence traces to a real number, reinforcing the project's existing
  "coverage-honesty, never auto-conclude" discipline. No hallucinated stats, no cost, no
  latency.

### The audience constraint (decided)

- **No role labels.** The briefing reads as one shared report about the state of the book.
  Situations are labeled by the *situation* ("Needs attention", "Room to grow"), never by
  the *owner* (no "CS call list" / "Sales queue" / "Ops watch"). Anyone reads the whole
  thing and self-selects what's theirs. Account lists are **narrative evidence**, not
  worklists.

---

## 2. Goals & non-goals

### Goals
- One woven **executive-briefing** layout (chosen over editorial-scrollytelling and
  dashboard-with-rail alternatives) with a **split thesis cover** (story left, health
  right).
- A **three-act arc**: *Where we stand → Which way we're moving → Where the upside is.*
- **Rich, chart-forward** presentation — complex bespoke SVG viz encouraged (cartogram,
  treemap, concentration curve, band/momentum flow, slopegraph, realization funnel,
  adoption small-multiples).
- A reusable **deterministic narration engine** that produces the thesis, per-act captions,
  and mover callouts from the data.
- Preserve the pure/IO split, resilient fan-out, coverage-honesty, and single-source band
  logic already in place.

### Non-goals (v1)
- **Reliability / "Ops" beat** — no data plumbing exists (no failed-login / latency / error
  events fetched, and coverage is unverified). Deferred until data is confirmed.
- **LLM / Claude-generated narration** — no key, out of scope.
- **Role-scoped worklists / per-persona tabs** — explicitly rejected in favor of the shared
  narrative.
- **True health-band *flips over time*** (prior-window composite) — deferred; see §5 Act 2
  and §10.

---

## 3. The narrative arc

```
┌─ COVER — the thesis (persistent header) ────────────────────────────┐
│  split: thesis + verdict + key stats  |  health donut + band counts │
└─────────────────────────────────────────────────────────────────────┘
ACT 1 · Where we stand      — the book: big, sticky, lopsided
ACT 2 · Which way we're moving — the pulse: who's rising / sliding
ACT 3 · Where the upside is  — loved for basics, thin on the AI edge
   (hover anywhere → per-account focus glyph drill-down)
```

Each act follows the same rhythm: **eyebrow label → narration headline (the "so what") →
one complex hero chart + supporting charts**. That cadence keeps it rich without becoming a
wall of equal-weight tiles.

---

## 4. Section-by-section design

Legend: **[reuse]** existing component · **[new]** build · **[repurpose]** adapt a
currently-dead component.

### Cover — "The state of the book" (split)
- Left: eyebrow ("last 30 days"), **thesis** headline, one-line **verdict**, 2–3 key stats
  (questions/mo, % premium reach, median health).
- Right: **health band donut** **[reuse `BandArc`]** with green/watch/at-risk counts.
- Window toggle (30d/90d) stays; narration is window-aware.
- Component: **`Cover.tsx` [new]** (composes `BandArc` + narration).

### Act 1 · Where we stand — *"Broad, but lopsided."*
- **Health cartogram** **[reuse `IntelMap`]** — every state, colored by composite health.
- **Volume treemap** **[reuse `IntelTreemap`]** — departments sized by question volume.
- **Concentration curve** **[new `ConcentrationCurve.tsx`]** — a Lorenz/Pareto curve making
  "top 5 states ≈ 86% of volume" literal. **Pure client-side** from the per-account
  `current` volumes already in the response. No new data.

### Act 2 · Which way we're moving — *"The book tilted up — but four slipped."*
- **Momentum ledger** **[new `MomentumLedger.tsx`]** — counts by `status`
  (risers / decliners / new / stable), already computed by `classify()`. Plus book-wide
  volume Δ vs prior.
- **Movers slopegraph** **[new `MoversSlope.tsx`]** — top risers & fallers, prior→current
  **question volume** (both already per-account). Risers green, fallers red.
- **Health distribution histogram** **[new `HealthDistribution.tsx`, repurposing
  `Constellation.tsx`]** — composite scores bucketed; makes "at-risk tail → healthy head"
  visible. Pure from existing composites.
- **All Act 2 data already exists** — no new upstream calls (see §6).

### Act 3 · Where the upside is — *"Loved for the basics. Thin on the AI edge."*
- **Realization-gap chart** (hero) **[new `RealizationGap.tsx`]** — book-wide feature totals
  as descending bars: PDF 22.9k / Questions 13k / Signoffs 5.2k → the **cliff** → Workspace
  1.3k / Form Emailed 1k / AI Forms 151 / Export 85 / Redaction 79. A dashed rule marks the
  AI-differentiated drop-off. Fed by a **new book-wide `featureTotals`** aggregate (trivial
  sum of batches the route already fetches — see §6).
- **Whitespace matrix** **[reuse `WhitespaceMatrix`]** — accounts × features; the cross-sell
  map.
- **Premium adoption trend** **[new `AdoptionTrend.tsx`]** — small multiples (one sparkline
  per premium feature over 6 months) flagging the **Workspace breakout** and **AI-Forms
  stall**. Fed by a **new lightweight trend route** (see §6). Independent time-series shape,
  book-wide, ~4 events × 6 monthly buckets.

### Per-account drill-down — **[reuse `AccountHoverCard` → `AccountFocus`]**
- Unchanged: hover any account anywhere → the 4-spoke health glyph, "held back by X",
  **Next play** (`recommend()`), and the value-delivered upside line.

### Deleted / repurposed
- **`LensQuadrant.tsx` [delete]** — currently dead (imported nowhere), superseded.
- **`Constellation.tsx` [repurpose]** into `HealthDistribution` (histogram), or delete if the
  new component is cleaner from scratch.

---

## 5. Narration layer — `lib/narrative.ts` (new, pure, unit-tested)

The heart of "improve the narration." A pure module that takes the `IntelligenceResponse`
(+ trend data) and returns the story text:

```ts
interface Narrative {
  thesis: string;              // the cover headline
  verdict: string;             // one-line so-what
  coverStats: StatLine[];      // {value, label} the numbers that prove it
  act1: string;                // "Broad, but lopsided — top 5 states ≈ 86% …"
  act2: string;                // "The book tilted up: 61 gaining, 48 sliding; …"
  act3: string;                // "Officers ask constantly but ship little — …"
  movers: { risers: Mover[]; fallers: Mover[] }; // named evidence
}
```

- **Template-driven**, deterministic, window-aware. Each clause is guarded: a null stat
  simply drops its clause (graceful degradation), never prints "undefined".
- Selection is the craft — pick the *one* number that matters per beat (Knaflic "Big Idea",
  Few callouts). E.g. Act 1 leads with the concentration figure; Act 3 leads with the
  premium-feature ratio.
- Neutral voice: *"Castle Rock PD needs attention — questions fell 39%,"* never *"CS should
  call Castle Rock."*
- Replaces the ad-hoc `story` useMemo currently inline in `IntelConsole.tsx`.

### Thesis selection — data-driven, not hard-coded

The thesis string is **not** a constant. Two things are always separate:

1. **Numbers are always computed live** — 34k questions, `<5%` premium reach, median health,
   etc. are read from the response every render. Never baked in.
2. **The *framing* (which "Big Idea" to lead with) is chosen by an ordered rule set**, not
   free-written (no LLM) and not frozen. We author a small curated library of candidate
   theses, each guarded by a condition over book-level signals, and pick the first match:

   ```ts
   // illustrative — order matters; first satisfied rule wins
   const THESES = [
     { when: s => s.premiumReachPct < 0.10 && s.questionVolume > HIGH,
       thesis: "Deep adoption, under-realized value.",
       verdict: s => `Officers lean on Blue Voice daily, but the AI-differentiated
                      workflow reaches just ${pct(s.premiumReachPct)} of the book.` },
     { when: s => s.atRiskShare > 0.25 || s.medianHealth < 45,
       thesis: "The book is softening.",
       verdict: s => `${s.atRisk} departments are at risk and the median is
                      ${s.medianHealth}/100 — retention is the story this month.` },
     { when: s => s.volumeDeltaPct > 0.10 && s.risers > s.decliners,
       thesis: "Broad-based momentum.",
       verdict: s => `Usage is up ${pct(s.volumeDeltaPct)} with ${s.risers} accounts
                      gaining — growth is outrunning churn.` },
   ];
   // neutral fallback when no rule fires confidently — describe, don't conclude:
   const FALLBACK = { thesis: "The state of the book.",
                      verdict: s => `${s.total} active departments, median ${s.medianHealth}/100.` };
   ```

This keeps the headline **self-updating and honest**: if AI-Forms adoption surges or the
at-risk tail grows, a *different* pre-authored thesis fires on its own. It cannot invent a
narrative we didn't anticipate (that would need an LLM) — but within the designed vocabulary
it never goes stale and never asserts a claim its guard doesn't support. The **neutral
fallback** is the "never auto-conclude" safety valve: when the data doesn't clearly match a
story, it *describes* the book instead of forcing one. Thresholds live beside `WEIGHTS` /
`BAND_BREAKS` as tunable, calibrated constants.

---

## 6. Data architecture & new data needs

Existing flow is preserved: client → `/api/*` route handlers (Node, `revalidate = 600`) →
`getAgencyTotals` → Amplitude segmentation; mirrored by React Query `staleTime`.

**What needs no new upstream data (derivable from the current `/api/intelligence` response):**
- Concentration curve — from per-account `current` volumes.
- Momentum ledger, movers slopegraph, health distribution — from `status`, `prior`,
  `current`, `composite` already returned per account.

**New aggregate on the existing route (cheap):**
- `featureTotals` — book-wide sums of the feature batches the route **already fetches**
  (`PDF Loaded`, `New Question Asked`, `Signoff`, `Workspace`, `Form Emailed`, `AI Forms`,
  `Artifact Exported`, `Redaction Created`). Add to `computeIntelligence` / the response.
  **Zero new Amplitude calls.**

**One genuinely new fetch — the trend route:**
- `app/api/trends/route.ts` **[new]** — book-wide monthly time series for the premium
  features over ~6 months. Different shape from the account board (non-grouped, monthly
  interval), so it gets its **own route + React Query hook** (`useTrends`) and loads
  independently of the heavy account board.
- Requires a small addition to `lib/amplitude.ts`: a **non-grouped event-trend fetch**
  (e.g. `getEventTrend(range, { event, interval })`) alongside `getAgencyTotals`. Verified
  query shape: `eventsSegmentation`, `metric: totals`, `range: "Last 6 Months"`,
  `interval: 30`. Keep it in the **credentialed server-only layer**; pure shaping in a
  testable helper.
- **Resilience:** if the trend route fails, the `AdoptionTrend` panel hides; the rest of the
  briefing is unaffected — same "don't block on nice-to-haves" ethos as the main fan-out.

---

## 7. Component & file inventory

**Create**
- `components/intelligence/Cover.tsx`
- `components/intelligence/ConcentrationCurve.tsx`
- `components/intelligence/MomentumLedger.tsx`
- `components/intelligence/MoversSlope.tsx`
- `components/intelligence/HealthDistribution.tsx` (repurpose `Constellation`)
- `components/intelligence/RealizationGap.tsx`
- `components/intelligence/AdoptionTrend.tsx`
- `lib/narrative.ts` + `lib/__tests__/narrative.test.ts`
- `app/api/trends/route.ts`

**Modify**
- `components/intelligence/IntelConsole.tsx` → the briefing orchestrator (cover + 3 acts);
  drop the inline `story` useMemo in favor of `lib/narrative.ts`.
- `app/api/intelligence/route.ts` → add `featureTotals` to the response.
- `lib/intelligence.ts` → aggregate `featureTotals`; extend `IntelligenceResponse`.
- `lib/amplitude.ts` → add non-grouped `getEventTrend`.
- `components/hooks.ts` → add `useTrends`.

**Reuse (unchanged)**
- `IntelMap`, `IntelTreemap`, `WhitespaceMatrix`, `BandArc`, `AccountHoverCard`,
  `AccountFocus`, `LensGlyph`, `lens.ts`, `lib/query.ts`, `lib/route-helpers.ts`,
  `lib/intelligence.ts` scoring core.

**Delete**
- `components/intelligence/LensQuadrant.tsx` (dead).

---

## 8. Error handling & resilience
- Reuse `errorResponse()` and the route-helper error classes.
- `/api/intelligence` must-have spine unchanged (throws → 500/502); secondary lenses stay
  in the `runLimited` allSettled batch.
- `/api/trends` is fully optional — failure degrades to a hidden panel, never an error state
  for the board.
- Narration degrades clause-by-clause on null stats.

## 9. Testing
- `lib/__tests__/narrative.test.ts` **[new]** — thesis/verdict/act-caption/mover generation
  across data shapes: full data, all-green, all-red, empty book, missing lenses, sub-floor
  accounts (null deltas). Assert no "undefined"/placeholder leakage.
- `lib/__tests__/intelligence.test.ts` — extend for `featureTotals` aggregation.
- New `getEventTrend` shaping helper — pure unit test with a recorded sample response.
- Keep the full suite green; `lint` + `tsc` + `build` clean; screenshot-verify the live
  board.

---

## 10. Decisions (resolved 2026-07-02)
1. **Thesis wording** — ✅ **cleaner** *"Deep adoption, under-realized value"* as the cover
   headline; the AI-edge nuance lives in the verdict line + Act 3.
2. **Act 2 movement basis** — ✅ v1 uses **usage-volume movement + status ledger** (no new
   upstream calls). True health-band flips over time deferred.
3. **Trend window** — ✅ 6 months, monthly buckets.
4. **Orchestrator** — ✅ evolve/rename `IntelConsole`.

## 11. Out of scope (named for clarity)
Reliability/Ops beat · LLM narration · role-scoped worklists/tabs · true historical band-flip
tracking · any officer/individual-grain data (department/state grain only, always).
