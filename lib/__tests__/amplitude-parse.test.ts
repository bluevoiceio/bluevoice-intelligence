import { describe, expect, it } from "vitest";

import {
  aggregateBreakdown,
  aggregateGeo,
  aggregateStateDept,
  labelToParts,
  parseSegmentation,
  sum,
  type RawSegmentation,
  type ParsedSeries,
} from "@/lib/amplitude-parse";

describe("labelToParts", () => {
  it("handles plain string labels (single group_by)", () => {
    expect(labelToParts("Massachusetts")).toEqual(["Massachusetts"]);
  });

  it("handles array labels (two group_by)", () => {
    expect(labelToParts(["Massachusetts", "Quincy PD"])).toEqual([
      "Massachusetts",
      "Quincy PD",
    ]);
  });

  it("drops a leading numeric index", () => {
    expect(labelToParts([0, "Massachusetts"])).toEqual(["Massachusetts"]);
  });

  it("unwraps object-shaped labels", () => {
    expect(labelToParts({ value: "Texas" })).toEqual(["Texas"]);
  });

  it("returns [] for null/undefined", () => {
    expect(labelToParts(null)).toEqual([]);
    expect(labelToParts(undefined)).toEqual([]);
  });
});

describe("aggregateGeo", () => {
  // Mirrors the §8 sanity baseline (New Question Asked, Prod, 90d, totals).
  const raw: RawSegmentation = {
    data: {
      xValues: ["2026-03-28", "2026-03-29"],
      series: [
        [10000, 7702], // Massachusetts -> 17702
        [2000, 2003], // New Jersey     -> 4003
        [1331, 2000], // Texas          -> 3331
        [5000, 4316], // (none)         -> untagged 9316
      ],
      seriesLabels: ["Massachusetts", "New Jersey", "Texas", "(none)"],
    },
  };

  it("joins per-state totals and excludes (none)", () => {
    const { parsed } = parseSegmentation(raw);
    const agg = aggregateGeo(parsed);
    expect(agg.byState).toEqual({
      Massachusetts: 17702,
      "New Jersey": 4003,
      Texas: 3331,
    });
    expect(agg.total).toBe(25036);
    expect(agg.activeStates).toBe(3);
    expect(agg.untagged).toBe(9316);
  });

  it("prefers seriesCollapsed totals when present", () => {
    const collapsed: RawSegmentation = {
      data: {
        series: [[1, 1]],
        seriesCollapsed: [[{ value: 17702 }]],
        seriesLabels: ["Massachusetts"],
      },
    };
    const { parsed } = parseSegmentation(collapsed);
    expect(aggregateGeo(parsed).byState.Massachusetts).toBe(17702);
  });
});

describe("aggregateBreakdown", () => {
  it("collapses to the trailing part and sorts desc", () => {
    const raw: RawSegmentation = {
      data: {
        series: [
          [1001],
          [800],
          [739],
        ],
        seriesLabels: [
          ["Massachusetts", "Quincy PD"],
          ["Massachusetts", "Holyoke"],
          ["Massachusetts", "Cambridge PD"],
        ],
      },
    };
    const { parsed } = parseSegmentation(raw);
    const groups = aggregateBreakdown(parsed);
    expect(groups).toEqual([
      { key: "Quincy PD", total: 1001 },
      { key: "Holyoke", total: 800 },
      { key: "Cambridge PD", total: 739 },
    ]);
  });
});

describe("sum", () => {
  it("tolerates undefined and non-numerics", () => {
    expect(sum(undefined)).toBe(0);
    expect(sum([1, 2, 3])).toBe(6);
  });
});

describe("aggregateStateDept", () => {
  const rows: ParsedSeries[] = [
    { parts: ["Massachusetts", "Quincy PD"], total: 335, series: [] },
    { parts: ["Massachusetts", "Holyoke"], total: 279, series: [] },
    { parts: ["New Jersey", "Quincy PD"], total: 5, series: [] }, // same dept, other state
    { parts: ["Quincy PD"], total: 7, series: [] }, // no state part -> (none)
  ];

  it("keeps both state and department and sums duplicates", () => {
    const out = aggregateStateDept(rows);
    expect(out).toContainEqual({ state: "Massachusetts", department: "Quincy PD", total: 335 });
    expect(out).toContainEqual({ state: "New Jersey", department: "Quincy PD", total: 5 });
    expect(out).toContainEqual({ state: "(none)", department: "Quincy PD", total: 7 });
    expect(out).toContainEqual({ state: "Massachusetts", department: "Holyoke", total: 279 });
  });

  it("sums rows that share the same state and department", () => {
    const out = aggregateStateDept([
      { parts: ["Massachusetts", "Quincy PD"], total: 100, series: [] },
      { parts: ["Massachusetts", "Quincy PD"], total: 50, series: [] },
    ]);
    expect(out).toContainEqual({ state: "Massachusetts", department: "Quincy PD", total: 150 });
  });
});
