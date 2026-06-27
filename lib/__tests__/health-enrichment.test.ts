import { describe, expect, it } from "vitest";

import { computeHealth, computeScore, HEALTH_DEFAULTS, type HealthEnrichment } from "@/lib/health";
import { bucketDailyToWeekly, aggregateStateDeptWeekly } from "@/lib/amplitude-parse";
import type { ParsedSeries, StateDeptTotal } from "@/lib/amplitude-parse";

const opts = { hideTest: true, ...HEALTH_DEFAULTS };
const sdt = (state: string, department: string, total: number): StateDeptTotal => ({
  state,
  department,
  total,
});

describe("computeScore", () => {
  it("scores a steep decline low and a strong rise high (trend only)", () => {
    expect(computeScore(-40, "decliner")).toBeLessThan(20);
    expect(computeScore(50, "riser")).toBeGreaterThan(90);
  });

  it("treats a 'new' agency as a healthy-ish score even with null delta", () => {
    expect(computeScore(null, "new")).toBeGreaterThan(60);
  });

  it("blends officer breadth and answer quality when present", () => {
    const trendOnly = computeScore(0, "stable");
    const enriched = computeScore(0, "stable", 0.95, 0.02); // great breadth + quality
    expect(enriched).toBeGreaterThan(trendOnly);
    const poor = computeScore(0, "stable", 0.2, 0.09); // dormant seats + bad answers
    expect(poor).toBeLessThan(trendOnly);
  });
});

describe("bucketDailyToWeekly", () => {
  it("sums trailing 7-day buckets in chronological order", () => {
    const daily = [...Array(21)].map(() => 1); // 21 days of 1 → 3 weeks of 7
    expect(bucketDailyToWeekly(daily, 3)).toEqual([7, 7, 7]);
  });

  it("left-pads with zeros when shorter than requested weeks", () => {
    expect(bucketDailyToWeekly([1, 1, 1], 3)).toEqual([0, 0, 3]);
  });
});

describe("aggregateStateDeptWeekly", () => {
  it("keys per (state,department) and buckets the daily series", () => {
    const parsed: ParsedSeries[] = [
      { parts: ["Massachusetts; Quincy PD"], total: 14, series: [...Array(14)].map(() => 1) },
    ];
    const map = aggregateStateDeptWeekly(parsed, 2);
    expect(map.get("Massachusetts|Quincy PD")).toEqual([7, 7]);
  });
});

describe("computeHealth enrichment", () => {
  it("attaches series, active officers, breadth and answer-quality, and rescores", () => {
    const enrichment: HealthEnrichment = {
      series: new Map([["Massachusetts|Quincy PD", [100, 120, 140]]]),
      activeOfficers: new Map([["Massachusetts|Quincy PD", 60]]),
      provisionedOfficers: new Map([["Massachusetts|Quincy PD", 120]]),
      betterAnswers: new Map([["Massachusetts|Quincy PD", 20]]),
    };
    const { agencies } = computeHealth(
      [sdt("Massachusetts", "Quincy PD", 400)],
      [sdt("Massachusetts", "Quincy PD", 380)],
      opts,
      enrichment,
    );
    const a = agencies[0];
    expect(a.series).toEqual([100, 120, 140]);
    expect(a.activeOfficers).toBe(60);
    expect(a.breadth).toBeCloseTo(0.5);
    expect(a.betterAnswerRate).toBeCloseTo(20 / 400);
    expect(a.usps).toBe("MA");
    expect(a.score).toBeGreaterThan(0);
  });

  it("leaves enrichment fields undefined when no maps are supplied", () => {
    const { agencies } = computeHealth(
      [sdt("Massachusetts", "Quincy PD", 400)],
      [sdt("Massachusetts", "Quincy PD", 380)],
      opts,
    );
    expect(agencies[0].series).toBeUndefined();
    expect(agencies[0].breadth).toBeUndefined();
    expect(agencies[0].betterAnswerRate).toBeUndefined();
    expect(agencies[0].score).toBeGreaterThan(0);
  });
});
