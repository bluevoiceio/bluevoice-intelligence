# Company Narrative Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Account Intelligence view into a single scrollable "company narrative" executive briefing — a split thesis cover + three-act arc (Where we stand → Which way we're moving → Where the upside is) — driven by a deterministic, rule-based narration engine and richer bespoke-SVG charts.

**Architecture:** Preserve the existing pure/IO split. Pure logic (feature totals, narration, chart-data transforms, trend bucketing) lives in `lib/` and is unit-tested; server fetches stay behind `import "server-only"` in `lib/amplitude.ts`; thin client SVG components in `components/intelligence/` render the pure outputs. One new lightweight route (`/api/trends`) powers the 6-month adoption sparklines; everything else reuses data the board already returns.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 + shadcn/ui · TanStack React Query v5 · `d3-scale` (scales only) · Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-07-02-company-narrative-briefing-design.md`

## Global Constraints

- **Route handlers** declare `export const runtime = "nodejs"` and `export const revalidate = 600`.
- **Amplitude dates** are always `YYYYMMDD` in `America/New_York` — use `lib/query.ts` (`trailingWindow`), never raw `Date` ISO.
- **Pillar/Forms events lack `Environment`** — query Workspace / Redaction / AI Forms / Form Emailed / Signoff / PDF / Artifact on env `"All"`; chat events (`New Question Asked`, Better Answer, Downvote) stay on the requested env.
- **`hideTest` defaults ON**; compute every peer-relative figure over the *filtered* book.
- **Band edges have ONE source of truth:** `BAND_BREAKS` / `bandFor` in `lib/intelligence.ts`. Never hardcode 40/66.
- **Grain is department/state only.** Never individual-officer.
- **No LLM.** Narration is deterministic template prose; the thesis is rule-selected, never hardcoded; numbers are always computed live.
- **No role labels.** Situation-based copy only ("Needs attention" / "Room to grow"), neutral voice.
- **`server-only` stays isolated to `lib/amplitude.ts`.** `lib/charts.ts` and `lib/narrative.ts` must be pure and client-importable (no `server-only`, no `fetch`).
- **Test discovery:** Vitest only picks up `lib/**/*.test.ts` and `components/**/*.test.tsx`. Put pure, tested logic in `lib/`.
- Run the whole suite with `npm test`; a single file with `npx vitest run <path>`.

---

## File Structure

**Create**
- `lib/charts.ts` — pure chart-data transforms (Lorenz, histogram, movers, funnel bars, sparkline path). Tested.
- `lib/narrative.ts` — deterministic narration engine: `deriveSignals`, rule-based `selectThesis`, act captions, `buildNarrative`. Tested.
- `app/api/trends/route.ts` — 6-month premium-adoption trend route.
- `components/intelligence/Cover.tsx` — split thesis cover.
- `components/intelligence/ConcentrationCurve.tsx` — Lorenz curve (Act 1).
- `components/intelligence/MomentumLedger.tsx` — status counts (Act 2).
- `components/intelligence/MoversSlope.tsx` — prior→current volume slopegraph (Act 2).
- `components/intelligence/HealthDistribution.tsx` — composite histogram (Act 2; supersedes Constellation).
- `components/intelligence/RealizationGap.tsx` — feature drop-off funnel (Act 3).
- `components/intelligence/AdoptionTrend.tsx` — premium sparkline small-multiples (Act 3).

**Modify**
- `lib/intelligence.ts` — add `FeatureTotals`, aggregate it in `computeIntelligence`, add to `IntelligenceResponse`.
- `lib/amplitude-parse.ts` — add `TrendPoint`/`TrendSeries`/`TrendsResponse` types + pure `bucketDailyToMonthly`.
- `lib/amplitude.ts` — add `getEventTrend`.
- `app/api/intelligence/route.ts` — thread `featureTotals` into the response.
- `components/hooks.ts` — add `useTrends`.
- `components/intelligence/IntelConsole.tsx` — becomes the briefing orchestrator (cover + 3 acts, narration).

**Delete**
- `components/intelligence/LensQuadrant.tsx` (dead code).
- `components/intelligence/Constellation.tsx` (replaced by `HealthDistribution`).

---

## Task 1: Feature totals in the scoring core

**Files:**
- Modify: `lib/intelligence.ts`
- Test: `lib/__tests__/intelligence.test.ts`

**Interfaces:**
- Produces: `interface FeatureTotals { questions: number; documents: number; signoffs: number; workspace: number; formsEmailed: number; aiFormsFilled: number; artifactsExported: number; redaction: number }`; `computeIntelligence(...)` return gains `featureTotals: FeatureTotals`; `IntelligenceResponse` gains `featureTotals?: FeatureTotals`.

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/intelligence.test.ts`:

```ts
import { computeIntelligence, buildAccountInputs, INTELLIGENCE_DEFAULTS } from "@/lib/intelligence";

describe("featureTotals", () => {
  const opts = { ...INTELLIGENCE_DEFAULTS, hideTest: true };

  it("sums each feature across kept accounts and excludes test departments", () => {
    const inputs = buildAccountInputs({
      current: [
        { state: "Massachusetts", department: "Quincy PD", total: 100 },
        { state: "Massachusetts", department: "TEST Dept", total: 999 },
      ],
      prior: [{ state: "Massachusetts", department: "Quincy PD", total: 80 }],
      documents: [{ state: "Massachusetts", department: "Quincy PD", total: 40 }],
      workspace: [{ state: "Massachusetts", department: "Quincy PD", total: 7 }],
      redaction: [{ state: "Massachusetts", department: "Quincy PD", total: 3 }],
      signoffs: [{ state: "Massachusetts", department: "Quincy PD", total: 12 }],
      formsEmailed: [{ state: "Massachusetts", department: "Quincy PD", total: 5 }],
      formsAiFilled: [{ state: "Massachusetts", department: "Quincy PD", total: 2 }],
      artifactsExported: [{ state: "Massachusetts", department: "Quincy PD", total: 1 }],
    });
    const { featureTotals } = computeIntelligence(inputs, opts);
    expect(featureTotals).toEqual({
      questions: 100, documents: 40, signoffs: 12, workspace: 7,
      formsEmailed: 5, aiFormsFilled: 2, artifactsExported: 1, redaction: 3,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/intelligence.test.ts -t featureTotals`
Expected: FAIL — `featureTotals` is `undefined`.

- [ ] **Step 3: Add the type and aggregation**

In `lib/intelligence.ts`, add the interface near `IntelligenceSummary`:

```ts
/** Book-wide feature usage totals for the current window — powers the Act 3
 *  realization-gap funnel. Summed over the kept (filtered) accounts only. */
export interface FeatureTotals {
  questions: number;
  documents: number;
  signoffs: number;
  workspace: number;
  formsEmailed: number;
  aiFormsFilled: number;
  artifactsExported: number;
  redaction: number;
}
```

Add `featureTotals?: FeatureTotals;` to `IntelligenceResponse`.

In `computeIntelligence`, after the `for (const a of kept)` loop and before the `accounts.sort(...)`, add:

```ts
  const featureTotals: FeatureTotals = kept.reduce(
    (t, a) => {
      t.questions += a.current;
      t.documents += a.pillars?.documents ?? 0;
      t.workspace += a.pillars?.workspace ?? 0;
      t.redaction += a.pillars?.redaction ?? 0;
      t.signoffs += a.signoffs ?? 0;
      t.formsEmailed += a.formsEmailed ?? 0;
      t.aiFormsFilled += a.formsAiFilled ?? 0;
      t.artifactsExported += a.artifactsExported ?? 0;
      return t;
    },
    { questions: 0, documents: 0, signoffs: 0, workspace: 0, formsEmailed: 0, aiFormsFilled: 0, artifactsExported: 0, redaction: 0 },
  );
```

Change the return type and value of `computeIntelligence` to include it:

```ts
): { accounts: AccountIntelligence[]; summary: IntelligenceSummary; featureTotals: FeatureTotals } {
  // ...existing body...
  return { accounts, summary: { total: accounts.length, bands }, featureTotals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/intelligence.test.ts -t featureTotals`
Expected: PASS.

- [ ] **Step 5: Run the full suite (nothing else broke)**

Run: `npm test`
Expected: all pass (the `computeIntelligence` return-shape change is additive).

- [ ] **Step 6: Commit**

```bash
git add lib/intelligence.ts lib/__tests__/intelligence.test.ts
git commit -m "feat(intelligence): aggregate book-wide featureTotals for the realization gap"
```

---

## Task 2: Thread featureTotals through the route

**Files:**
- Modify: `app/api/intelligence/route.ts:164-182`

**Interfaces:**
- Consumes: `computeIntelligence(...).featureTotals` (Task 1).
- Produces: `/api/intelligence` JSON now includes `featureTotals`.

- [ ] **Step 1: Destructure and return featureTotals**

In `app/api/intelligence/route.ts`, change:

```ts
    const { accounts, summary } = computeIntelligence(buildAccountInputs(signals), {
```
to:
```ts
    const { accounts, summary, featureTotals } = computeIntelligence(buildAccountInputs(signals), {
```

Then change the final response to include it:

```ts
    return NextResponse.json({ accounts: rows, summary, featureTotals, unavailablePillars, window: windowDays });
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify against live data**

Start the dev server if not running: `npm run dev`
Run: `curl -s 'http://localhost:3000/api/intelligence?hideTest=1' | jq '.featureTotals'`
Expected: an object with non-zero `questions`, `documents`, `signoffs`, and small `aiFormsFilled`/`redaction` (the realization gap), e.g. roughly `{ questions: ~13000, documents: ~22000, signoffs: ~5000, aiFormsFilled: <200, redaction: <100, ... }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/intelligence/route.ts
git commit -m "feat(intelligence): expose featureTotals in the intelligence route response"
```

---

## Task 3: Pure chart-data helpers

**Files:**
- Create: `lib/charts.ts`
- Test: `lib/__tests__/charts.test.ts`

**Interfaces:**
- Produces:
  - `sumByState(accounts: Pick<AccountIntelligence,"state"|"current">[]): { state: string; value: number }[]` (desc by value)
  - `lorenzPoints(values: number[]): { x: number; y: number }[]` (points 0→1, includes origin)
  - `topShare(values: number[], k: number): number` (share of total held by the top-k values)
  - `histogramBuckets(values: number[], width?: number): { lo: number; hi: number; count: number }[]` (0–100)
  - `topMovers(accounts: AccountIntelligence[], n?: number): { risers: Mover[]; fallers: Mover[] }` where `Mover = { department: string; usps: string; deltaPct: number }`
  - `funnelBars(t: FeatureTotals): { key: string; label: string; value: number; frac: number }[]` (desc, `frac = value/max`)
  - `sparklinePath(values: number[], w: number, h: number): string` (SVG polyline points, min→max normalized per series)

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/charts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  sumByState, lorenzPoints, topShare, histogramBuckets, topMovers, funnelBars, sparklinePath,
} from "@/lib/charts";
import type { AccountIntelligence } from "@/lib/intelligence";

function acct(p: Partial<AccountIntelligence>): AccountIntelligence {
  return {
    state: "Massachusetts", department: "Dept", usps: "MA", current: 0, prior: 0,
    deltaPct: null, status: "stable", composite: 50, band: "yellow",
    lenses: { activity: 50, momentum: 50, trust: null, breadth: null, realization: null, activation: null },
    pillarsUsed: 0, ...p,
  };
}

describe("sumByState", () => {
  it("sums current by state, sorted desc", () => {
    expect(sumByState([
      { state: "MA", current: 10 }, { state: "TX", current: 5 }, { state: "MA", current: 4 },
    ])).toEqual([{ state: "MA", value: 14 }, { state: "TX", value: 5 }]);
  });
});

describe("topShare", () => {
  it("returns the fraction of total held by the largest k", () => {
    expect(topShare([50, 30, 10, 10], 1)).toBeCloseTo(0.5);
    expect(topShare([50, 30, 10, 10], 2)).toBeCloseTo(0.8);
  });
  it("is 0 when total is 0", () => expect(topShare([0, 0], 1)).toBe(0));
});

describe("lorenzPoints", () => {
  it("starts at origin and ends at (1,1)", () => {
    const pts = lorenzPoints([1, 1, 1, 1]);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 1, y: 1 });
  });
  it("bows toward concentration when one value dominates", () => {
    const pts = lorenzPoints([97, 1, 1, 1]); // sorted desc internally
    // after the first (largest) account, cumulative volume share is already high
    expect(pts[1].y).toBeGreaterThan(0.9);
  });
});

describe("histogramBuckets", () => {
  it("buckets 0-100 into fixed-width bins", () => {
    const b = histogramBuckets([5, 15, 15, 95], 10);
    expect(b.length).toBe(10);
    expect(b[0]).toEqual({ lo: 0, hi: 10, count: 1 });
    expect(b[1]).toEqual({ lo: 10, hi: 20, count: 2 });
    expect(b[9]).toEqual({ lo: 90, hi: 100, count: 1 });
  });
});

describe("topMovers", () => {
  it("splits biggest risers and fallers by deltaPct, ignoring nulls", () => {
    const accts = [
      acct({ department: "Up", usps: "MA", deltaPct: 40 }),
      acct({ department: "Down", usps: "CO", deltaPct: -39 }),
      acct({ department: "Flat", usps: "TX", deltaPct: null }),
    ];
    const { risers, fallers } = topMovers(accts, 2);
    expect(risers[0].department).toBe("Up");
    expect(fallers[0].department).toBe("Down");
    expect(risers.every((m) => m.deltaPct > 0)).toBe(true);
  });
});

describe("funnelBars", () => {
  it("orders features desc with frac relative to the max", () => {
    const bars = funnelBars({
      questions: 100, documents: 200, signoffs: 50, workspace: 10,
      formsEmailed: 8, aiFormsFilled: 2, artifactsExported: 1, redaction: 1,
    });
    expect(bars[0].key).toBe("documents");
    expect(bars[0].frac).toBe(1);
    expect(bars[1].key).toBe("questions");
    expect(bars[1].frac).toBeCloseTo(0.5);
  });
});

describe("sparklinePath", () => {
  it("maps first point to left edge and the max to the top", () => {
    const path = sparklinePath([0, 5, 10], 100, 30);
    expect(path.startsWith("0,")).toBe(true);       // first x at 0
    expect(path).toContain("100,0");                 // last point is the max → top (y=0)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/charts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/charts'`.

- [ ] **Step 3: Implement `lib/charts.ts`**

```ts
import type { AccountIntelligence, FeatureTotals } from "@/lib/intelligence";

/** Pure chart-data transforms for the briefing's bespoke SVG charts. No React,
 *  no DOM, no I/O — unit tested in lib/__tests__/charts.test.ts. */

export interface Mover {
  department: string;
  usps: string;
  deltaPct: number;
}

/** Sum `current` by state, descending — feeds the concentration curve + Act 1 copy. */
export function sumByState(accounts: Pick<AccountIntelligence, "state" | "current">[]): { state: string; value: number }[] {
  const by = new Map<string, number>();
  for (const a of accounts) by.set(a.state, (by.get(a.state) ?? 0) + a.current);
  return [...by.entries()].map(([state, value]) => ({ state, value })).sort((p, q) => q.value - p.value);
}

/** Share of the grand total held by the k largest values (0–1). */
export function topShare(values: number[], k: number): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, k).reduce((s, v) => s + v, 0);
  return top / total;
}

/** Lorenz curve points (x = cumulative share of accounts, y = cumulative share
 *  of volume), sorted so the largest contributor comes first — the curve bows
 *  toward the top-left as concentration rises. Includes the (0,0) origin. */
export function lorenzPoints(values: number[]): { x: number; y: number }[] {
  const sorted = [...values].sort((a, b) => b - a);
  const total = sorted.reduce((s, v) => s + v, 0);
  const n = sorted.length;
  const pts = [{ x: 0, y: 0 }];
  if (n === 0 || total <= 0) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  let cum = 0;
  sorted.forEach((v, i) => {
    cum += v;
    pts.push({ x: (i + 1) / n, y: cum / total });
  });
  return pts;
}

/** Fixed-width histogram over the 0–100 composite scale. */
export function histogramBuckets(values: number[], width = 10): { lo: number; hi: number; count: number }[] {
  const bins = Math.ceil(100 / width);
  const buckets = Array.from({ length: bins }, (_, i) => ({ lo: i * width, hi: (i + 1) * width, count: 0 }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(v / width)));
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Biggest risers and fallers by month-over-month % delta (nulls excluded). */
export function topMovers(accounts: AccountIntelligence[], n = 3): { risers: Mover[]; fallers: Mover[] } {
  const withDelta = accounts.filter((a): a is AccountIntelligence & { deltaPct: number } => a.deltaPct != null);
  const toMover = (a: AccountIntelligence & { deltaPct: number }): Mover => ({ department: a.department, usps: a.usps, deltaPct: a.deltaPct });
  const risers = withDelta.filter((a) => a.deltaPct > 0).sort((x, y) => y.deltaPct - x.deltaPct).slice(0, n).map(toMover);
  const fallers = withDelta.filter((a) => a.deltaPct < 0).sort((x, y) => x.deltaPct - y.deltaPct).slice(0, n).map(toMover);
  return { risers, fallers };
}

const FUNNEL_ORDER: { key: keyof FeatureTotals; label: string }[] = [
  { key: "documents", label: "PDF Loaded" },
  { key: "questions", label: "Questions" },
  { key: "signoffs", label: "Signoffs" },
  { key: "workspace", label: "Workspace" },
  { key: "formsEmailed", label: "Form Emailed" },
  { key: "aiFormsFilled", label: "AI Forms" },
  { key: "artifactsExported", label: "Exported" },
  { key: "redaction", label: "Redaction" },
];

/** Feature totals as descending funnel bars; `frac` is relative to the max. */
export function funnelBars(t: FeatureTotals): { key: string; label: string; value: number; frac: number }[] {
  const rows = FUNNEL_ORDER.map(({ key, label }) => ({ key: String(key), label, value: t[key] }));
  rows.sort((a, b) => b.value - a.value);
  const max = rows[0]?.value || 1;
  return rows.map((r) => ({ ...r, frac: r.value / max }));
}

/** SVG polyline `points` for a sparkline, normalized per-series into a w×h box
 *  (min → bottom, max → top). Flat series render as a mid-line. */
export function sparklinePath(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const y = max === min ? h / 2 : h - ((v - min) / span) * h;
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/charts.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add lib/charts.ts lib/__tests__/charts.test.ts
git commit -m "feat(intelligence): pure chart-data helpers (lorenz, histogram, movers, funnel, sparkline)"
```

---

## Task 4: Deterministic narration engine

**Files:**
- Create: `lib/narrative.ts`
- Test: `lib/__tests__/narrative.test.ts`

**Interfaces:**
- Consumes: `IntelligenceResponse` (Task 1/2), `topMovers`/`sumByState`/`topShare` (Task 3), `TrendSeries` (Task 5 — type-only import; safe to reference before Task 5 lands since it's a pure type, but implement Task 5's type first if the build complains).
- Produces:
  - `deriveSignals(data: IntelligenceResponse): BookSignals`
  - `selectThesis(s: BookSignals): { thesis: string; verdict: string }`
  - `buildNarrative(data: IntelligenceResponse, trends?: TrendSeries[]): Narrative`
  - types `BookSignals`, `Narrative`, `StatLine`, re-export `Mover`.

> To avoid a cross-task type dependency, define a local `TrendSeries` type-only import: `import type { TrendSeries } from "@/lib/amplitude-parse";`. If Task 5 hasn't landed, temporarily declare `type TrendSeries = { event: string; points: { month: string; value: number }[] }` at the top and delete it once Task 5 exports the real one. Prefer doing Task 5 before this task's Step 3 if executing in order.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/narrative.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveSignals, selectThesis, buildNarrative } from "@/lib/narrative";
import type { AccountIntelligence, IntelligenceResponse, FeatureTotals } from "@/lib/intelligence";

function acct(p: Partial<AccountIntelligence>): AccountIntelligence {
  return {
    state: "Massachusetts", department: "Dept", usps: "MA", current: 100, prior: 90,
    deltaPct: 11, status: "stable", composite: 55, band: "yellow",
    lenses: { activity: 55, momentum: 60, trust: null, breadth: null, realization: null, activation: null },
    pillarsUsed: 1, pillars: { ask: 100, documents: 10, workspace: 0, redaction: 0, compliance: 0 }, ...p,
  };
}

const FT: FeatureTotals = {
  questions: 13000, documents: 22000, signoffs: 5000, workspace: 1300,
  formsEmailed: 1000, aiFormsFilled: 150, artifactsExported: 85, redaction: 79,
};

function resp(p: Partial<IntelligenceResponse>): IntelligenceResponse {
  const accounts = p.accounts ?? [acct({ composite: 30, band: "red" }), acct({ composite: 55 }), acct({ composite: 80, band: "green" })];
  return {
    accounts,
    summary: { total: accounts.length, bands: { green: 1, yellow: 1, red: 1 } },
    featureTotals: FT, window: 30, ...p,
  };
}

describe("deriveSignals", () => {
  it("computes median health, at-risk share and premium reach", () => {
    const s = deriveSignals(resp({}));
    expect(s.total).toBe(3);
    expect(s.atRisk).toBe(1);
    expect(s.medianHealth).toBe(55);
    expect(s.atRiskShare).toBeCloseTo(1 / 3);
    expect(s.premiumReachPct).toBe(0); // no account uses workspace/redaction above
  });
});

describe("selectThesis (rule-based, data-driven)", () => {
  it("fires under-realized value when premium reach is low and volume high", () => {
    const s = deriveSignals(resp({}));
    expect(selectThesis(s).thesis).toBe("Deep adoption, under-realized value.");
  });

  it("fires softening when the at-risk share is high", () => {
    const accts = [acct({ composite: 20, band: "red" }), acct({ composite: 25, band: "red" }), acct({ composite: 30, band: "red" }), acct({ composite: 60 })];
    const s = deriveSignals(resp({ accounts: accts, summary: { total: 4, bands: { green: 0, yellow: 1, red: 3 } } }));
    expect(selectThesis(s).thesis).toBe("The book is softening.");
  });

  it("falls back to a neutral description when no rule matches", () => {
    // high premium reach + healthy + flat → no story fires
    const accts = [acct({ composite: 70, band: "green", pillars: { ask: 10, documents: 5, workspace: 9, redaction: 2, compliance: 1 } })];
    const s = deriveSignals(resp({ accounts: accts, summary: { total: 1, bands: { green: 1, yellow: 0, red: 0 } }, featureTotals: { ...FT, questions: 10 } }));
    expect(selectThesis(s).thesis).toBe("The state of the book.");
  });
});

describe("buildNarrative", () => {
  it("produces non-empty act captions and never leaks 'undefined'/'NaN'", () => {
    const n = buildNarrative(resp({}));
    for (const line of [n.thesis, n.verdict, n.act1, n.act2, n.act3]) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(/undefined|NaN/);
    }
    expect(n.coverStats.length).toBeGreaterThan(0);
  });

  it("degrades gracefully on an empty book", () => {
    const n = buildNarrative({ accounts: [], summary: { total: 0, bands: { green: 0, yellow: 0, red: 0 } }, window: 30 });
    expect(n.thesis.length).toBeGreaterThan(0);
    expect(n.act1).not.toMatch(/undefined|NaN/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/narrative.test.ts`
Expected: FAIL — `Cannot find module '@/lib/narrative'`.

- [ ] **Step 3: Implement `lib/narrative.ts`**

```ts
import type { AccountIntelligence, IntelligenceResponse } from "@/lib/intelligence";
import type { TrendSeries } from "@/lib/amplitude-parse";
import { sumByState, topShare, topMovers, type Mover } from "@/lib/charts";
import { fmt, fmtCompact, fmtPct } from "@/lib/format";

/** Deterministic narration for the briefing. Pure — no React, no I/O. The
 *  thesis is chosen by data-guarded rules (never hardcoded); every number is
 *  read from the response. Unit tested in lib/__tests__/narrative.test.ts. */

export type { Mover };

export interface BookSignals {
  total: number;
  atRisk: number;
  atRiskShare: number;
  medianHealth: number;
  questionVolume: number;
  volumeDeltaPct: number | null;
  risers: number;
  decliners: number;
  premiumReachPct: number;
  topState: { state: string; share: number } | null;
}

export interface StatLine {
  value: string;
  label: string;
}

export interface Narrative {
  thesis: string;
  verdict: string;
  coverStats: StatLine[];
  act1: string;
  act2: string;
  act3: string;
  movers: { risers: Mover[]; fallers: Mover[] };
}

const HIGH_VOLUME = 3000; // book-wide questions that qualify as "deep adoption"

/** An account counts as reaching premium if it uses Workspace or Redaction. */
function usesPremium(a: AccountIntelligence): boolean {
  return (a.pillars?.workspace ?? 0) > 0 || (a.pillars?.redaction ?? 0) > 0;
}

export function deriveSignals(data: IntelligenceResponse): BookSignals {
  const accounts = data.accounts;
  const total = data.summary.total;
  const atRisk = data.summary.bands.red;

  const composites = accounts.map((a) => a.composite).sort((x, y) => x - y);
  const medianHealth = composites.length ? composites[Math.floor(composites.length / 2)] : 0;

  const questionVolume = data.featureTotals?.questions ?? accounts.reduce((s, a) => s + a.current, 0);
  const priorVolume = accounts.reduce((s, a) => s + a.prior, 0);
  const currentVolume = accounts.reduce((s, a) => s + a.current, 0);
  const volumeDeltaPct = priorVolume > 0 ? (currentVolume - priorVolume) / priorVolume : null;

  const risers = accounts.filter((a) => a.status === "riser").length;
  const decliners = accounts.filter((a) => a.status === "decliner").length;
  const premiumReachPct = total ? accounts.filter(usesPremium).length / total : 0;

  const states = sumByState(accounts);
  const stateTotal = states.reduce((s, x) => s + x.value, 0);
  const topState = states.length && stateTotal > 0 ? { state: states[0].state, share: states[0].value / stateTotal } : null;

  return {
    total, atRisk, atRiskShare: total ? atRisk / total : 0, medianHealth,
    questionVolume, volumeDeltaPct, risers, decliners, premiumReachPct, topState,
  };
}

interface ThesisRule {
  when: (s: BookSignals) => boolean;
  thesis: string;
  verdict: (s: BookSignals) => string;
}

/** Ordered candidate theses — the first satisfied rule wins. Editorial framing
 *  is authored here; the DATA decides which one fires, so the headline updates
 *  when the book changes and never overstates what its guard doesn't support. */
const THESES: ThesisRule[] = [
  {
    when: (s) => s.premiumReachPct < 0.1 && s.questionVolume > HIGH_VOLUME,
    thesis: "Deep adoption, under-realized value.",
    verdict: (s) =>
      `Officers lean on Blue Voice every day, but the AI-differentiated workflow reaches just ${fmtPct(s.premiumReachPct)} of the book — that gap is the runway.`,
  },
  {
    when: (s) => s.atRiskShare > 0.25 || s.medianHealth < 45,
    thesis: "The book is softening.",
    verdict: (s) =>
      `${fmt(s.atRisk)} departments are at risk and the median scores ${s.medianHealth}/100 — retention is the story this month.`,
  },
  {
    when: (s) => (s.volumeDeltaPct ?? 0) > 0.1 && s.risers > s.decliners,
    thesis: "Broad-based momentum.",
    verdict: (s) =>
      `Usage is up ${fmtPct(s.volumeDeltaPct ?? 0)} with ${fmt(s.risers)} accounts gaining — growth is outrunning churn.`,
  },
];

/** Neutral fallback — describe, never conclude — when no rule fires. */
const FALLBACK: Pick<ThesisRule, "thesis" | "verdict"> = {
  thesis: "The state of the book.",
  verdict: (s) => `${fmt(s.total)} active departments, median health ${s.medianHealth}/100.`,
};

export function selectThesis(s: BookSignals): { thesis: string; verdict: string } {
  const rule = THESES.find((r) => r.when(s)) ?? FALLBACK;
  return { thesis: rule.thesis, verdict: rule.verdict(s) };
}

function act1Caption(s: BookSignals, accounts: AccountIntelligence[]): string {
  if (!s.total) return "No active departments in this window.";
  const stateVals = sumByState(accounts).map((x) => x.value);
  const top5 = topShare(stateVals, 5);
  const lead = s.topState ? `${s.topState.state} alone drives ${fmtPct(s.topState.share)} of volume` : "usage is spread thin";
  return `${fmt(s.total)} departments are active, but the top 5 states hold ${fmtPct(top5)} of all questions — ${lead}. Broad, but lopsided.`;
}

function act2Caption(s: BookSignals): string {
  const dir = (s.volumeDeltaPct ?? 0) >= 0 ? "up" : "down";
  const vol = s.volumeDeltaPct == null ? "" : ` Volume is ${dir} ${fmtPct(Math.abs(s.volumeDeltaPct))}.`;
  return `${fmt(s.risers)} accounts are gaining and ${fmt(s.decliners)} are sliding month-over-month.${vol}`;
}

function act3Caption(s: BookSignals, trends?: TrendSeries[]): string {
  const base = `Officers ask constantly but ship little — the AI-differentiated features reach just ${fmtPct(s.premiumReachPct)} of the book.`;
  const hi = trendHighlight(trends);
  return hi ? `${base} ${hi}` : base;
}

/** Names the fastest-growing premium series, e.g. "Workspace is up ~20× in 6 months." */
function trendHighlight(trends?: TrendSeries[]): string | null {
  if (!trends || trends.length === 0) return null;
  let best: { event: string; ratio: number } | null = null;
  for (const t of trends) {
    const first = t.points.find((p) => p.value > 0)?.value;
    const last = t.points[t.points.length - 1]?.value ?? 0;
    if (!first || last <= first) continue;
    const ratio = last / first;
    if (!best || ratio > best.ratio) best = { event: t.event, ratio };
  }
  if (!best || best.ratio < 1.5) return null;
  return `${best.event} is up ~${Math.round(best.ratio)}× over six months — part of the runway is already lifting off.`;
}

export function buildNarrative(data: IntelligenceResponse, trends?: TrendSeries[]): Narrative {
  const s = deriveSignals(data);
  const { thesis, verdict } = selectThesis(s);
  const coverStats: StatLine[] = [
    { value: fmtCompact(s.questionVolume), label: "questions / mo" },
    { value: fmtPct(s.premiumReachPct), label: "reach premium" },
    { value: `${s.medianHealth}`, label: "median health" },
  ];
  return {
    thesis,
    verdict,
    coverStats,
    act1: act1Caption(s, data.accounts),
    act2: act2Caption(s),
    act3: act3Caption(s, trends),
    movers: topMovers(data.accounts, 3),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/narrative.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/narrative.ts lib/__tests__/narrative.test.ts
git commit -m "feat(intelligence): deterministic rule-based narration engine"
```

---

## Task 5: Monthly trend bucketing + server fetch

**Files:**
- Modify: `lib/amplitude-parse.ts`
- Modify: `lib/amplitude.ts`
- Test: `lib/__tests__/amplitude-parse.test.ts`

**Interfaces:**
- Produces:
  - `interface TrendPoint { month: string; value: number }`
  - `interface TrendSeries { event: string; points: TrendPoint[] }`
  - `interface TrendsResponse { series: TrendSeries[]; window: number }`
  - `bucketDailyToMonthly(daily: number[], xValues: string[], months?: number): TrendPoint[]`
  - `getEventTrend(window: { start: string; end: string }, opts: { event: string; env: Environment }): Promise<TrendSeries>`

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/amplitude-parse.test.ts` (create the file if it doesn't exist, importing existing helpers as needed):

```ts
import { describe, it, expect } from "vitest";
import { bucketDailyToMonthly } from "@/lib/amplitude-parse";

describe("bucketDailyToMonthly", () => {
  it("sums daily values into trailing calendar-month buckets", () => {
    const xValues = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02", "2026-03-01"];
    const daily = [1, 2, 3, 4, 5];
    const pts = bucketDailyToMonthly(daily, xValues, 3);
    expect(pts).toEqual([
      { month: "2026-01", value: 3 },
      { month: "2026-02", value: 7 },
      { month: "2026-03", value: 5 },
    ]);
  });

  it("keeps only the last `months` buckets, chronological", () => {
    const xValues = ["2026-01-15", "2026-02-15", "2026-03-15"];
    const pts = bucketDailyToMonthly([1, 2, 3], xValues, 2);
    expect(pts.map((p) => p.month)).toEqual(["2026-02", "2026-03"]);
  });

  it("returns [] when lengths mismatch or are empty", () => {
    expect(bucketDailyToMonthly([], [], 6)).toEqual([]);
    expect(bucketDailyToMonthly([1, 2], ["2026-01-01"], 6)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/amplitude-parse.test.ts -t bucketDailyToMonthly`
Expected: FAIL — `bucketDailyToMonthly` is not exported.

- [ ] **Step 3: Implement `bucketDailyToMonthly` + types in `lib/amplitude-parse.ts`**

Append to `lib/amplitude-parse.ts`:

```ts
export interface TrendPoint {
  month: string; // "YYYY-MM"
  value: number;
}
export interface TrendSeries {
  event: string;
  points: TrendPoint[];
}
export interface TrendsResponse {
  series: TrendSeries[];
  window: number; // days covered (~180)
}

/**
 * Sum a daily series into trailing calendar-month buckets, keyed "YYYY-MM".
 * `xValues` are the Amplitude date labels ("YYYY-MM-DD") aligned 1:1 with
 * `daily`. Returns the last `months` months, chronological. Empty on any
 * length mismatch (defensive — a malformed response yields no trend, not a
 * crash or a wrong read).
 */
export function bucketDailyToMonthly(daily: number[], xValues: string[], months = 6): TrendPoint[] {
  if (daily.length === 0 || daily.length !== xValues.length) return [];
  const byMonth = new Map<string, number>();
  for (let i = 0; i < daily.length; i++) {
    const month = xValues[i].slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + (Number(daily[i]) || 0));
  }
  const ordered = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, value]) => ({ month, value }));
  return ordered.slice(-months);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/amplitude-parse.test.ts -t bucketDailyToMonthly`
Expected: PASS.

- [ ] **Step 5: Add `getEventTrend` to `lib/amplitude.ts`**

At the bottom of `lib/amplitude.ts`, add (imports: extend the existing `amplitude-parse` import to include `parseSegmentation` — already imported — and add the `TrendSeries` type; add `bucketDailyToMonthly`):

```ts
import { bucketDailyToMonthly, type TrendSeries } from "@/lib/amplitude-parse";

/**
 * Book-wide monthly trend for a single event (no group-by), for the adoption
 * sparklines. Fetches a daily series over the window and buckets it to months
 * — mirrors the daily-fetch-then-bucket pattern of the weekly board series.
 */
export async function getEventTrend(
  window: { start: string; end: string },
  opts: { event: string; env: Environment },
): Promise<TrendSeries> {
  const raw = await segmentation({
    event: opts.event,
    metric: "totals",
    start: window.start,
    end: window.end,
    env: opts.env,
    groupBy: [],
  });
  const { parsed, xValues } = parseSegmentation(raw);
  const daily = parsed[0]?.series ?? [];
  return { event: opts.event, points: bucketDailyToMonthly(daily, xValues, 6) };
}
```

> Note: add `parseSegmentation` to the existing top-of-file import from `@/lib/amplitude-parse` if it isn't already there (it currently imports `aggregateStateDept`, `parseSegmentation`, `RawSegmentation`, `StateDeptTotal` — so it is).

- [ ] **Step 6: Verify compile + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/amplitude-parse.ts lib/amplitude.ts lib/__tests__/amplitude-parse.test.ts
git commit -m "feat(intelligence): monthly trend bucketing + getEventTrend fetch"
```

---

## Task 6: Trend route + hook

**Files:**
- Create: `app/api/trends/route.ts`
- Modify: `components/hooks.ts`

**Interfaces:**
- Consumes: `getEventTrend` (Task 5), `trailingWindow` (`lib/query.ts`), `errorResponse` (`lib/route-helpers.ts`), `runLimited`-style resilience (inline).
- Produces: `GET /api/trends` → `TrendsResponse`; `useTrends(): UseQueryResult<TrendsResponse>`.

- [ ] **Step 1: Implement the route**

Create `app/api/trends/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getEventTrend } from "@/lib/amplitude";
import { trailingWindow } from "@/lib/query";
import { errorResponse } from "@/lib/route-helpers";
import type { TrendSeries, TrendsResponse } from "@/lib/amplitude-parse";

export const runtime = "nodejs";
export const revalidate = 600;

/** Premium features whose adoption trend we chart. All lack `Environment`, so
 *  they must be queried on "All" (see the pillar-env caveat). */
const PREMIUM_EVENTS = ["Workspace Chat Sent", "Form Emailed Successfully", "Redaction Created", "AI Forms Filled Successfully"];

const TREND_DAYS = 180;

export async function GET() {
  try {
    const window = trailingWindow(TREND_DAYS, 0);
    const settled = await Promise.allSettled(
      PREMIUM_EVENTS.map((event) => getEventTrend(window, { event, env: "All" })),
    );
    const series: TrendSeries[] = settled
      .filter((r): r is PromiseFulfilledResult<TrendSeries> => r.status === "fulfilled")
      .map((r) => r.value);
    const body: TrendsResponse = { series, window: TREND_DAYS };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Add the hook**

Append to `components/hooks.ts`:

```ts
import type { TrendsResponse } from "@/lib/amplitude-parse";

export function useTrends() {
  return useQuery({
    queryKey: ["trends"],
    queryFn: () => fetchJson<TrendsResponse>("/api/trends"),
  });
}
```

- [ ] **Step 3: Verify against live data**

Run (dev server up): `curl -s 'http://localhost:3000/api/trends' | jq '.series[] | {event, last: .points[-1].value, first: .points[0].value}'`
Expected: four series; `Workspace Chat Sent` shows `last` ≫ `first` (the breakout), `AI Forms Filled Successfully` roughly flat.

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/trends/route.ts components/hooks.ts
git commit -m "feat(intelligence): /api/trends route + useTrends hook"
```

---

## Task 7: Cover component

**Files:**
- Create: `components/intelligence/Cover.tsx`

**Interfaces:**
- Consumes: `Narrative` (Task 4), `bandColor`/`compositeRamp` (`lens.ts`), `BandArc` (existing), `IntelligenceSummary`.
- Produces: `<Cover narrative={Narrative | null} summary={IntelligenceSummary | undefined} loading={boolean} />`.

- [ ] **Step 1: Implement the component**

Create `components/intelligence/Cover.tsx`:

```tsx
"use client";

import { BandArc } from "@/components/intelligence/BandArc";
import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Narrative } from "@/lib/narrative";
import type { IntelligenceSummary } from "@/lib/intelligence";

export function Cover({
  narrative,
  summary,
  loading,
}: {
  narrative: Narrative | null;
  summary?: IntelligenceSummary;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary">The state of the book</p>
          {loading || !narrative ? (
            <Skeleton className="mt-3 h-9 w-80 max-w-full" />
          ) : (
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{narrative.thesis}</h1>
          )}
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground text-balance">
            {narrative?.verdict ?? "Loading the book…"}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {(narrative?.coverStats ?? []).map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3">
          <BandArc bands={summary?.bands ?? { green: 0, yellow: 0, red: 0 }} total={summary?.total ?? 0} />
          <div className="flex gap-3 text-xs text-muted-foreground">
            {(["green", "yellow", "red"] as const).map((b) => (
              <span key={b} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: bandColor(b).solid }} />
                <span className="tabular-nums">{summary ? summary.bands[b] : "—"}</span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors. (Wired into the page in Task 11; not yet rendered.)

- [ ] **Step 3: Commit**

```bash
git add components/intelligence/Cover.tsx
git commit -m "feat(intelligence): split thesis Cover component"
```

---

## Task 8: Act 1 — Concentration curve

**Files:**
- Create: `components/intelligence/ConcentrationCurve.tsx`

**Interfaces:**
- Consumes: `lorenzPoints`, `sumByState`, `topShare` (Task 3), `AccountIntelligence`, `ACCENT`/`SIGNAL` (`lens.ts`), `fmtPct` (`lib/format`).
- Produces: `<ConcentrationCurve accounts={AccountIntelligence[]} />`.

- [ ] **Step 1: Implement the component**

Create `components/intelligence/ConcentrationCurve.tsx`:

```tsx
"use client";

import { useMemo } from "react";

import { lorenzPoints, sumByState, topShare } from "@/lib/charts";
import { SIGNAL } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmtPct } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

const W = 320;
const H = 200;
const PAD = 24;

export function ConcentrationCurve({ accounts }: { accounts: AccountIntelligence[] }) {
  const { path, top5 } = useMemo(() => {
    const stateVals = sumByState(accounts).map((s) => s.value);
    const pts = lorenzPoints(stateVals);
    const path = pts
      .map((p, i) => {
        const x = PAD + p.x * (W - 2 * PAD);
        const y = H - PAD - p.y * (H - 2 * PAD);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { path, top5: topShare(stateVals, 5) };
  }, [accounts]);

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Volume concentration — states
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Volume concentration curve">
          {/* axes */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
          {/* line of perfect equality */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={PAD} stroke="currentColor" strokeDasharray="3 3" opacity={0.25} />
          {/* the Lorenz curve */}
          <path d={path} fill="none" stroke={SIGNAL} strokeWidth={2.5} />
          <text x={W - PAD} y={PAD - 6} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.7}>
            top 5 states = {fmtPct(top5)}
          </text>
        </svg>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/intelligence/ConcentrationCurve.tsx
git commit -m "feat(intelligence): Act 1 concentration (Lorenz) curve"
```

---

## Task 9: Act 2 — Momentum ledger, movers slopegraph, distribution

**Files:**
- Create: `components/intelligence/MomentumLedger.tsx`
- Create: `components/intelligence/MoversSlope.tsx`
- Create: `components/intelligence/HealthDistribution.tsx`
- Delete: `components/intelligence/Constellation.tsx`

**Interfaces:**
- Consumes: `Mover`/`histogramBuckets` (Task 3), `bandColor`/`compositeRamp`/`BAND_BREAKS`-aware coloring (`lens.ts` + `lib/intelligence`), `deltaPctLabel` (`lens.ts`), `AccountIntelligence`.
- Produces: `<MomentumLedger accounts /> `, `<MoversSlope movers={{risers,fallers}} />`, `<HealthDistribution accounts />`.

- [ ] **Step 1: Implement `MomentumLedger.tsx`**

```tsx
"use client";

import { useMemo } from "react";

import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

export function MomentumLedger({ accounts }: { accounts: AccountIntelligence[] }) {
  const counts = useMemo(() => {
    const c = { riser: 0, decliner: 0, new: 0, stable: 0 };
    for (const a of accounts) c[a.status] += 1;
    return c;
  }, [accounts]);

  const rows = [
    { label: "Gaining", value: counts.riser, color: bandColor("green").solid },
    { label: "Sliding", value: counts.decliner, color: bandColor("red").solid },
    { label: "New", value: counts.new, color: bandColor("yellow").solid },
    { label: "Steady", value: counts.stable, color: "var(--muted-foreground)" },
  ];

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Momentum ledger</p>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full" style={{ background: r.color }} />
              <span className="text-xl font-semibold tabular-nums">{fmt(r.value)}</span>
              <span className="text-xs text-muted-foreground">{r.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Implement `MoversSlope.tsx`**

```tsx
"use client";

import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import type { Mover } from "@/lib/charts";

const W = 320;
const H = 200;

/** Diverging bars: risers (green, right) and fallers (red, left) by MoM %. */
export function MoversSlope({ movers }: { movers: { risers: Mover[]; fallers: Mover[] } }) {
  const rows = [
    ...movers.fallers.map((m) => ({ ...m, up: false })),
    ...movers.risers.map((m) => ({ ...m, up: true })),
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.deltaPct)));
  const mid = W / 2;
  const barH = 18;

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Biggest movers — MoM %
        </p>
        <svg viewBox={`0 0 ${W} ${Math.max(H, rows.length * (barH + 8) + 12)}`} width="100%" role="img" aria-label="Biggest movers">
          <line x1={mid} y1={0} x2={mid} y2="100%" stroke="currentColor" opacity={0.15} />
          {rows.map((r, i) => {
            const y = 8 + i * (barH + 8);
            const len = (Math.abs(r.deltaPct) / max) * (mid - 60);
            const color = bandColor(r.up ? "green" : "red").solid;
            return (
              <g key={`${r.usps}-${r.department}`}>
                <rect x={r.up ? mid : mid - len} y={y} width={len} height={barH} rx={3} fill={color} opacity={0.85} />
                <text x={r.up ? mid + len + 5 : mid - len - 5} y={y + barH / 2 + 3} textAnchor={r.up ? "start" : "end"} fontSize={10} fill="currentColor">
                  {r.department} {r.deltaPct > 0 ? "+" : "−"}{Math.abs(Math.round(r.deltaPct))}%
                </text>
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Implement `HealthDistribution.tsx`**

```tsx
"use client";

import { useMemo } from "react";

import { histogramBuckets } from "@/lib/charts";
import { compositeRamp } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountIntelligence } from "@/lib/intelligence";

const W = 320;
const H = 200;
const PAD = 20;

export function HealthDistribution({ accounts }: { accounts: AccountIntelligence[] }) {
  const buckets = useMemo(() => histogramBuckets(accounts.map((a) => a.composite), 10), [accounts]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const bw = (W - 2 * PAD) / buckets.length;

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Health distribution — tail → head
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Health score distribution">
          {buckets.map((b, i) => {
            const h = (b.count / max) * (H - 2 * PAD);
            return (
              <rect
                key={b.lo}
                x={PAD + i * bw + 1}
                y={H - PAD - h}
                width={bw - 2}
                height={h}
                rx={2}
                fill={compositeRamp((b.lo + b.hi) / 2)}
                opacity={0.85}
              />
            );
          })}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
        </svg>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Delete the dead beeswarm**

```bash
git rm components/intelligence/Constellation.tsx
```

- [ ] **Step 5: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors (nothing imports `Constellation`).

- [ ] **Step 6: Commit**

```bash
git add components/intelligence/MomentumLedger.tsx components/intelligence/MoversSlope.tsx components/intelligence/HealthDistribution.tsx
git commit -m "feat(intelligence): Act 2 momentum ledger, movers slopegraph, distribution; drop dead Constellation"
```

---

## Task 10: Act 3 — Realization gap + adoption trend

**Files:**
- Create: `components/intelligence/RealizationGap.tsx`
- Create: `components/intelligence/AdoptionTrend.tsx`

**Interfaces:**
- Consumes: `funnelBars`/`sparklinePath` (Task 3), `FeatureTotals` (Task 1), `TrendSeries` (Task 5), `ACCENT`/`bandColor` (`lens.ts`), `fmt`/`fmtCompact` (`lib/format`), `BAND_BREAKS`.
- Produces: `<RealizationGap totals={FeatureTotals | undefined} />`, `<AdoptionTrend series={TrendSeries[] | undefined} />`.

- [ ] **Step 1: Implement `RealizationGap.tsx`**

```tsx
"use client";

import { useMemo } from "react";

import { funnelBars } from "@/lib/charts";
import { ACCENT, bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { FeatureTotals } from "@/lib/intelligence";

/** Features below this share of the max are the "AI-differentiated cliff". */
const CLIFF_FRAC = 0.05;

export function RealizationGap({ totals }: { totals?: FeatureTotals }) {
  const bars = useMemo(() => (totals ? funnelBars(totals) : []), [totals]);

  return (
    <Card className="flex-[1.3]">
      <CardContent className="p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          The realization gap — feature use, this window
        </p>
        <div className="flex flex-col gap-1.5">
          {bars.map((b) => {
            const belowCliff = b.frac < CLIFF_FRAC;
            const color = belowCliff ? bandColor("red").solid : ACCENT.signal;
            return (
              <div key={b.key} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">{b.label}</span>
                <div className="relative h-4 flex-1">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{ width: `${Math.max(b.frac * 100, 0.6)}%`, background: color, opacity: belowCliff ? 1 : 0.85 }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] font-medium tabular-nums" style={{ color: belowCliff ? bandColor("red").solid : undefined }}>
                  {fmt(b.value)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
          Heavy on the basics; the AI-differentiated features (red) are the runway.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Implement `AdoptionTrend.tsx`**

```tsx
"use client";

import { sparklinePath } from "@/lib/charts";
import { ACCENT } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { TrendSeries } from "@/lib/amplitude-parse";

const SW = 120;
const SH = 30;

/** Returns null when trend data is absent — the panel simply doesn't render,
 *  so a failed /api/trends never breaks the briefing. */
export function AdoptionTrend({ series }: { series?: TrendSeries[] }) {
  if (!series || series.length === 0) return null;

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Premium adoption — 6 months
        </p>
        <div className="flex flex-col gap-2.5">
          {series.map((s) => {
            const values = s.points.map((p) => p.value);
            const last = values[values.length - 1] ?? 0;
            const first = values.find((v) => v > 0) ?? 0;
            const ratio = first > 0 ? last / first : 0;
            const rising = last > first;
            return (
              <div key={s.event} className="rounded-lg border p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium">{s.event.replace(/ (Sent|Successfully|Created|Filled Successfully)$/, "")}</span>
                  <span className="text-xs font-semibold tabular-nums">{fmt(last)}</span>
                </div>
                <svg viewBox={`0 0 ${SW} ${SH}`} width="100%" height={26} preserveAspectRatio="none" className="mt-1">
                  <polyline points={sparklinePath(values, SW, SH)} fill="none" stroke={rising ? ACCENT.signal : "currentColor"} strokeWidth={2} opacity={rising ? 1 : 0.5} />
                </svg>
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {ratio >= 1.5 ? `▲ ${Math.round(ratio)}× · rising` : rising ? "▲ climbing" : "▬ flat"}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/intelligence/RealizationGap.tsx components/intelligence/AdoptionTrend.tsx
git commit -m "feat(intelligence): Act 3 realization gap + premium adoption trend"
```

---

## Task 11: Orchestrate the briefing

**Files:**
- Modify: `components/intelligence/IntelConsole.tsx` (full rewrite of the body)
- Delete: `components/intelligence/LensQuadrant.tsx`

**Interfaces:**
- Consumes: `useIntelligence`, `useTrends` (hooks); `buildNarrative` (Task 4); all Act components (Tasks 7–10); reused `IntelMap`, `IntelTreemap`, `WhitespaceMatrix`, `AccountHoverCard`.

- [ ] **Step 1: Rewrite `IntelConsole.tsx`**

Replace the file contents with:

```tsx
"use client";

import { useMemo, useState } from "react";

import { useIntelligence, useTrends } from "@/components/hooks";
import { AccountHoverCard } from "@/components/intelligence/AccountHoverCard";
import { Cover } from "@/components/intelligence/Cover";
import { IntelMap } from "@/components/intelligence/IntelMap";
import { IntelTreemap } from "@/components/intelligence/IntelTreemap";
import { ConcentrationCurve } from "@/components/intelligence/ConcentrationCurve";
import { MomentumLedger } from "@/components/intelligence/MomentumLedger";
import { MoversSlope } from "@/components/intelligence/MoversSlope";
import { HealthDistribution } from "@/components/intelligence/HealthDistribution";
import { RealizationGap } from "@/components/intelligence/RealizationGap";
import { AdoptionTrend } from "@/components/intelligence/AdoptionTrend";
import { WhitespaceMatrix } from "@/components/intelligence/WhitespaceMatrix";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNarrative } from "@/lib/narrative";
import type { AccountIntelligence } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

const WINDOW_OPTIONS = [30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

export function IntelConsole() {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const { data, isLoading, error } = useIntelligence(windowDays);
  const { data: trends } = useTrends();

  const [hover, setHover] = useState<{ a: AccountIntelligence; x: number; y: number } | null>(null);
  const onHover = (a: AccountIntelligence | null, e?: { clientX: number; clientY: number }) =>
    setHover(a && e ? { a, x: e.clientX, y: e.clientY } : null);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const narrative = useMemo(() => (data ? buildNarrative(data, trends?.series) : null), [data, trends]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <WindowToggle value={windowDays} onChange={setWindowDays} />
        <ThemeToggle />
      </header>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn&apos;t load intelligence: {(error as Error).message}
        </Card>
      ) : null}

      <Cover narrative={narrative} summary={data?.summary} loading={isLoading} />

      <Act n="01" title="Where we stand" caption={narrative?.act1 ?? "Loading…"}>
        {isLoading ? (
          <Skeleton className="h-[460px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-[1.2]">
                <IntelMap accounts={accounts} onHover={onHover} />
              </div>
              <ConcentrationCurve accounts={accounts} />
            </div>
            <IntelTreemap accounts={accounts} onHover={onHover} />
          </div>
        )}
      </Act>

      <Act n="02" title="Which way we're moving" caption={narrative?.act2 ?? ""}>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <MomentumLedger accounts={accounts} />
            <MoversSlope movers={narrative?.movers ?? { risers: [], fallers: [] }} />
            <HealthDistribution accounts={accounts} />
          </div>
        )}
      </Act>

      <Act n="03" title="Where the upside is" caption={narrative?.act3 ?? ""}>
        {isLoading ? (
          <Skeleton className="h-[360px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <RealizationGap totals={data?.featureTotals} />
            <WhitespaceMatrix accounts={accounts} unavailable={data?.unavailablePillars ?? []} onHover={onHover} />
            <AdoptionTrend series={trends?.series} />
          </div>
        )}
      </Act>

      {hover ? <AccountHoverCard account={hover.a} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

function Act({ n, title, caption, children }: { n: string; title: string; caption: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground/70">{n}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground text-balance">{caption}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function WindowToggle({ value, onChange }: { value: WindowDays; onChange: (w: WindowDays) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {WINDOW_OPTIONS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          aria-pressed={value === w}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
            value === w ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {w}d
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Delete the other dead component**

```bash
git rm components/intelligence/LensQuadrant.tsx
```

- [ ] **Step 3: Verify compile + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds (a stray client import of `server-only` would fail here — it won't, since `lib/charts.ts` and `lib/narrative.ts` are pure).

- [ ] **Step 4: Screenshot-verify the live briefing**

With `npm run dev` running, load `http://localhost:3000` and confirm, top to bottom: the cover shows the thesis + verdict + donut; Act 1 shows cartogram + concentration curve + treemap; Act 2 shows ledger + movers + distribution; Act 3 shows the realization funnel + whitespace + adoption sparklines; hovering an account still shows the focus glyph. (Use the argent Chromium tooling or a manual screenshot.)

- [ ] **Step 5: Commit**

```bash
git add components/intelligence/IntelConsole.tsx
git commit -m "feat(intelligence): assemble the company-narrative briefing; drop dead LensQuadrant"
```

---

## Task 12: Final verification & cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass (existing + `charts`, `narrative`, `featureTotals`, `bucketDailyToMonthly`).

- [ ] **Step 2: Lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Live sanity checks**

Run:
```bash
curl -s 'http://localhost:3000/api/intelligence?hideTest=1' | jq '{summary, featureTotals}'
curl -s 'http://localhost:3000/api/trends' | jq '.series | length'
```
Expected: `summary.total` ≈ 216 with a green/yellow/red split; `featureTotals` populated; `4` trend series.

- [ ] **Step 4: Confirm no dead references remain**

Run: `grep -rn "Constellation\|LensQuadrant" components app` (should return nothing).

- [ ] **Step 5: Update CLAUDE.md architecture note**

Update the visualization list in `CLAUDE.md` to match reality: replace the retired `Constellation`/`LensQuadrant` mentions with the new briefing components (`Cover`, `ConcentrationCurve`, `MomentumLedger`, `MoversSlope`, `HealthDistribution`, `RealizationGap`, `AdoptionTrend`) and note the deterministic `lib/narrative.ts` + `/api/trends`. Commit:

```bash
git add CLAUDE.md
git commit -m "docs: refresh CLAUDE.md for the company-narrative briefing"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** cover (Task 7), Act 1 cartogram+treemap+concentration (Task 8 + reuse), Act 2 ledger+movers+distribution (Task 9), Act 3 funnel+whitespace+trend (Task 10 + reuse), rule-based narration (Task 4), featureTotals (Tasks 1–2), trend route (Tasks 5–6), delete dead components (Tasks 9, 11), no-LLM / no-role-labels / band-single-source honored in Global Constraints. Ops/reliability correctly absent (out of scope).
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `FeatureTotals` (Task 1) used identically in Tasks 3/10; `Mover` defined in Task 3, re-exported in Task 4, consumed in Task 9; `TrendSeries`/`TrendsResponse` defined in Task 5, consumed in Tasks 6/10; `Narrative` defined in Task 4, consumed in Tasks 7/11.
```
