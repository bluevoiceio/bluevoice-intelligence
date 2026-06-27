// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { filterAgencies, HealthBoardView } from "@/components/HealthBoard";
import type { AgencyHealth, HealthResponse } from "@/lib/health";

const decliner: AgencyHealth = {
  department: "Castle Rock PD",
  state: "Colorado",
  usps: "CO",
  current: 203,
  prior: 334,
  deltaAbs: -131,
  deltaPct: -39,
  status: "decliner",
  score: 28,
};
const riser: AgencyHealth = {
  department: "Pittsfield",
  state: "Massachusetts",
  usps: "MA",
  current: 208,
  prior: 79,
  deltaAbs: 129,
  deltaPct: 163,
  status: "riser",
  score: 84,
};

const data: HealthResponse = {
  agencies: [decliner, riser],
  brief: "1 agency needs attention this week. Biggest drops: Castle Rock PD (−39%).",
  summary: {
    totalCurrent: 411,
    totalPrior: 413,
    atRiskCount: 1,
    risingCount: 1,
    newCount: 0,
    topDecliners: [decliner],
    topRisers: [riser],
    topNew: [],
    topStateShare: [{ state: "Colorado", pct: 49 }],
  },
};

describe("filterAgencies", () => {
  it("filters by state and by status", () => {
    expect(filterAgencies(data.agencies, "Colorado", "all")).toHaveLength(1);
    expect(filterAgencies(data.agencies, "all", "riser")).toEqual([riser]);
    expect(filterAgencies(data.agencies, "all", "all")).toHaveLength(2);
  });
});

describe("HealthBoardView", () => {
  it("renders the brief and agency rows", () => {
    render(
      <HealthBoardView
        data={data}
        loading={false}
        error={null}
        stateFilter="all"
        statusFilter="all"
        onStateChange={() => {}}
        onStatusChange={() => {}}
      />,
    );
    expect(screen.getByText(/needs attention this week/)).toBeTruthy();
    expect(screen.getByText("Castle Rock PD")).toBeTruthy();
  });
});
