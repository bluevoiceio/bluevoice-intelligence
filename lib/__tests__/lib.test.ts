import { describe, expect, it } from "vitest";

import { buildApiQuery, isTestDepartment, rangeToDates, trailingWindow, type Filters } from "@/lib/query";
import { makeColorScale, MAP_COLOR_EMPTY, uspsFor } from "@/lib/states";

describe("isTestDepartment", () => {
  it.each([
    ["Quincy PD", false],
    ["Nassau County", false],
    ["E2E Test Dept", true],
    ["Demo Agency", true],
    ["qa-sandbox", true],
    ["Red Voice PD", true],
    ["JAM Evaluation Police", true],
    ["Interns Department", true],
    ["Z INACTIVE Michigan State Police", true],
  ])("%s -> %s", (name, expected) => {
    expect(isTestDepartment(name)).toBe(expected);
  });
});

describe("rangeToDates", () => {
  it("produces YYYYMMDD strings with start before end", () => {
    const { start, end } = rangeToDates("90d");
    expect(start).toMatch(/^\d{8}$/);
    expect(end).toMatch(/^\d{8}$/);
    expect(Number(start)).toBeLessThan(Number(end));
  });
});

describe("trailingWindow", () => {
  it("produces YYYYMMDD bounds with start before end", () => {
    const { start, end } = trailingWindow(30, 0);
    expect(start).toMatch(/^\d{8}$/);
    expect(end).toMatch(/^\d{8}$/);
    expect(Number(start)).toBeLessThan(Number(end));
  });

  it("offsets the whole window backwards so prior ends where current starts", () => {
    const current = trailingWindow(30, 0);
    const prior = trailingWindow(30, 30);
    expect(Number(prior.start)).toBeLessThan(Number(current.start));
    expect(Number(prior.end)).toBeLessThanOrEqual(Number(current.start));
  });
});

describe("buildApiQuery", () => {
  const base: Filters = {
    event: "New Question Asked",
    metric: "totals",
    range: "90d",
    env: "Prod",
    role: "all",
    device: "all",
    hideTest: true,
    mapView: "geo",
  };

  it("omits all/role/device defaults and includes hideTest flag", () => {
    const qs = new URLSearchParams(buildApiQuery(base));
    expect(qs.get("event")).toBe("New Question Asked");
    expect(qs.get("role")).toBeNull();
    expect(qs.get("device")).toBeNull();
    expect(qs.get("hideTest")).toBe("1");
  });

  it("includes role and device when set", () => {
    const qs = new URLSearchParams(
      buildApiQuery({ ...base, role: "officer", device: "iPhone", hideTest: false }),
    );
    expect(qs.get("role")).toBe("officer");
    expect(qs.get("device")).toBe("iPhone");
    expect(qs.get("hideTest")).toBeNull();
  });
});

describe("states", () => {
  it("maps full names to USPS codes", () => {
    expect(uspsFor("Massachusetts")).toBe("MA");
    expect(uspsFor("New Jersey")).toBe("NJ");
    expect(uspsFor("Nowhere")).toBeUndefined();
  });

  it("color scale returns empty color for zero and a non-empty color otherwise", () => {
    const scale = makeColorScale(17702);
    expect(scale(0)).toBe(MAP_COLOR_EMPTY);
    expect(scale(17702)).not.toBe(MAP_COLOR_EMPTY);
    expect(scale(17702)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
