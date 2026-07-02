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
