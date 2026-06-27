import { describe, expect, it } from "vitest";

import { generateBrief } from "@/lib/brief";
import type { HealthSummary } from "@/lib/health";

function agency(department: string, deltaPct: number | null) {
  return {
    department,
    state: "Massachusetts",
    current: 1,
    prior: 1,
    deltaAbs: -1,
    deltaPct,
    status: "decliner" as const,
  };
}

const summary: HealthSummary = {
  totalCurrent: 12000,
  totalPrior: 12500,
  atRiskCount: 2,
  risingCount: 1,
  newCount: 1,
  topDecliners: [agency("La Vista City PD", -39), agency("Castle Rock PD", -39)],
  topRisers: [{ ...agency("Pittsfield", 163), status: "riser" }],
  topNew: [{ ...agency("Lakewood", null), status: "new" }],
  topStateShare: [{ state: "Massachusetts", pct: 48 }],
};

describe("generateBrief", () => {
  it("names the at-risk count and biggest decliners with percentages", () => {
    const text = generateBrief(summary);
    expect(text).toContain("2 agencies need attention");
    expect(text).toContain("La Vista City PD (−39%)");
    expect(text).toContain("Massachusetts");
  });

  it("handles a quiet week with no decliners", () => {
    const text = generateBrief({
      ...summary,
      atRiskCount: 0,
      topDecliners: [],
      newCount: 0,
      topNew: [],
    });
    expect(text).toContain("No agencies crossed the decline threshold");
  });

  it("uses singular wording for a single at-risk agency", () => {
    const text = generateBrief({
      ...summary,
      atRiskCount: 1,
      topDecliners: [agency("Solo PD", -30)],
    });
    expect(text).toContain("1 agency needs attention");
  });
});
