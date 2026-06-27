import { describe, expect, it } from "vitest";

import { computeHealth, HEALTH_DEFAULTS } from "@/lib/health";
import type { StateDeptTotal } from "@/lib/amplitude-parse";

const opts = { hideTest: true, ...HEALTH_DEFAULTS };

function sdt(state: string, department: string, total: number): StateDeptTotal {
  return { state, department, total };
}

describe("computeHealth", () => {
  it("classifies a large drop above the floor as a decliner", () => {
    const cur = [sdt("Nebraska", "La Vista City PD", 214)];
    const prior = [sdt("Nebraska", "La Vista City PD", 349)];
    const { agencies } = computeHealth(cur, prior, opts);
    const a = agencies.find((x) => x.department === "La Vista City PD")!;
    expect(a.status).toBe("decliner");
    expect(a.deltaAbs).toBe(-135);
    expect(Math.round(a.deltaPct!)).toBe(-39);
  });

  it("classifies a large rise above the floor as a riser", () => {
    const { agencies } = computeHealth(
      [sdt("Massachusetts", "Pittsfield", 208)],
      [sdt("Massachusetts", "Pittsfield", 79)],
      opts,
    );
    expect(agencies[0].status).toBe("riser");
  });

  it("classifies a near-zero prior with high current as new (deltaPct null)", () => {
    const { agencies } = computeHealth(
      [sdt("New Jersey", "Lakewood", 450)],
      [sdt("New Jersey", "Lakewood", 1)],
      opts,
    );
    expect(agencies[0].status).toBe("new");
    expect(agencies[0].deltaPct).toBeNull();
  });

  it("does not flag a low-volume drop below the floor as a decliner", () => {
    const { agencies } = computeHealth(
      [sdt("Maine", "Tiny PD", 2)],
      [sdt("Maine", "Tiny PD", 5)],
      opts,
    );
    expect(agencies[0].status).toBe("stable");
  });

  it("excludes test departments when hideTest is true", () => {
    const { agencies } = computeHealth(
      [sdt("Massachusetts", "TEST E2E Department", 144)],
      [sdt("Massachusetts", "TEST E2E Department", 104)],
      opts,
    );
    expect(agencies).toHaveLength(0);
  });

  it("keeps same-named departments in different states as separate agencies", () => {
    const { agencies } = computeHealth(
      [sdt("Massachusetts", "Lakewood", 300), sdt("New Jersey", "Lakewood", 35)],
      [sdt("Massachusetts", "Lakewood", 280)],
      opts,
    );
    const ma = agencies.find((a) => a.state === "Massachusetts" && a.department === "Lakewood")!;
    const nj = agencies.find((a) => a.state === "New Jersey" && a.department === "Lakewood")!;
    expect(ma.current).toBe(300);
    expect(ma.prior).toBe(280);
    expect(nj.current).toBe(35);
    expect(nj.prior).toBe(0);
  });

  it("excludes rows whose state is (none)", () => {
    const { agencies } = computeHealth(
      [sdt("(none)", "Mystery PD", 200)],
      [sdt("(none)", "Mystery PD", 100)],
      opts,
    );
    expect(agencies).toHaveLength(0);
  });

  it("flags an agency that vanished entirely as a -100% decliner", () => {
    const { agencies } = computeHealth(
      [],
      [sdt("Ohio", "Gone PD", 120)],
      opts,
    );
    const a = agencies.find((x) => x.department === "Gone PD")!;
    expect(a.status).toBe("decliner");
    expect(a.current).toBe(0);
    expect(Math.round(a.deltaPct!)).toBe(-100);
  });

  it("keeps test departments when hideTest is false", () => {
    const { agencies } = computeHealth(
      [sdt("Massachusetts", "TEST E2E Department", 80)],
      [sdt("Massachusetts", "TEST E2E Department", 60)],
      { ...opts, hideTest: false },
    );
    expect(agencies.some((a) => a.department === "TEST E2E Department")).toBe(true);
  });

  it("summary ranks decliners by absolute drop and computes state share", () => {
    const cur = [
      sdt("Colorado", "Castle Rock PD", 203),
      sdt("Nebraska", "La Vista City PD", 214),
    ];
    const prior = [
      sdt("Colorado", "Castle Rock PD", 334),
      sdt("Nebraska", "La Vista City PD", 349),
    ];
    const { summary } = computeHealth(cur, prior, opts);
    expect(summary.atRiskCount).toBe(2);
    expect(summary.topDecliners[0].department).toBe("La Vista City PD"); // -135 before -131
    expect(summary.topStateShare[0].pct).toBeGreaterThan(0);
  });

  it("ignores the (none) department bucket", () => {
    const { agencies } = computeHealth(
      [sdt("(none)", "(none)", 13)],
      [sdt("(none)", "(none)", 31)],
      opts,
    );
    expect(agencies).toHaveLength(0);
  });
});
