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
