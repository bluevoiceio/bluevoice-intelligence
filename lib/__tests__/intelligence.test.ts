import { describe, expect, it } from "vitest";

import {
  buildAccountInputs,
  computeIntelligence,
  INTELLIGENCE_DEFAULTS,
  type AccountInput,
} from "@/lib/intelligence";
import type { StateDeptTotal } from "@/lib/amplitude-parse";

const opts = { hideTest: true, ...INTELLIGENCE_DEFAULTS };

/** Minimal account: only the momentum signal (current/prior) present. */
function acct(partial: Partial<AccountInput> & Pick<AccountInput, "state" | "department">): AccountInput {
  return { current: 0, prior: 0, ...partial };
}

describe("computeIntelligence — momentum lens (always present)", () => {
  it("scores a momentum-only account on trend alone, leaving other lenses null", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "New York", department: "Nassau County", current: 130, prior: 100 })],
      opts,
    );
    const a = accounts[0];
    // deltaPct +30 → trend (30+50)/100 = 0.80 → 80
    expect(a.lenses.momentum).toBe(80);
    expect(a.lenses.trust).toBeNull();
    expect(a.lenses.breadth).toBeNull();
    expect(a.lenses.activation).toBeNull();
    // No other lenses → composite is the momentum score.
    expect(a.composite).toBe(80);
    expect(a.band).toBe("green");
  });

  it("scores a steep decliner low and bands it red", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Colorado", department: "Castle Rock PD", current: 60, prior: 100 })],
      opts,
    );
    expect(accounts[0].status).toBe("decliner");
    expect(accounts[0].composite).toBe(10); // (-40+50)/100 = 0.10
    expect(accounts[0].band).toBe("red");
  });

  it("treats a near-zero-prior surge as newly activated", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "New Jersey", department: "Lakewood", current: 200, prior: 1 })],
      opts,
    );
    expect(accounts[0].status).toBe("new");
    expect(accounts[0].composite).toBe(72);
    expect(accounts[0].band).toBe("yellow");
  });
});

describe("computeIntelligence — trust lens", () => {
  it("scores a low-friction account higher than a high-friction one", () => {
    const base = { state: "Massachusetts", current: 1000, prior: 1000, questions: 1000 };
    const { accounts } = computeIntelligence(
      [
        acct({ ...base, department: "Clean PD", betterAnswers: 20, downvotes: 2, formOk: 90, formFails: 2 }),
        acct({ ...base, department: "Frustrated PD", betterAnswers: 90, downvotes: 30, formOk: 40, formFails: 40 }),
      ],
      opts,
    );
    const clean = accounts.find((a) => a.department === "Clean PD")!;
    const bad = accounts.find((a) => a.department === "Frustrated PD")!;
    expect(clean.lenses.trust).not.toBeNull();
    expect(clean.lenses.trust!).toBeGreaterThan(bad.lenses.trust!);
  });

  it("leaves trust null when no quality signals are supplied", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Maine", department: "Quiet PD", current: 300, prior: 280 })],
      opts,
    );
    expect(accounts[0].lenses.trust).toBeNull();
  });
});

describe("computeIntelligence — breadth lens (product pillars)", () => {
  it("counts how many of the pillars an account uses", () => {
    const { accounts } = computeIntelligence(
      [
        acct({ state: "Texas", department: "Ask-Only PD", current: 500, prior: 500, pillars: { ask: 500, documents: 0, workspace: 0, redaction: 0, compliance: 0 } }),
        acct({ state: "Texas", department: "Full-Stack PD", current: 500, prior: 500, pillars: { ask: 500, documents: 40, workspace: 200, redaction: 60, compliance: 90 } }),
      ],
      opts,
    );
    const askOnly = accounts.find((a) => a.department === "Ask-Only PD")!;
    const full = accounts.find((a) => a.department === "Full-Stack PD")!;
    expect(askOnly.pillarsUsed).toBe(1);
    expect(full.pillarsUsed).toBe(5);
    // Adopting the harder pillars should score higher breadth than Ask alone.
    expect(full.lenses.breadth!).toBeGreaterThan(askOnly.lenses.breadth!);
  });

  it("leaves breadth null when no pillar data is supplied", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Ohio", department: "Beavercreek PD", current: 100, prior: 100 })],
      opts,
    );
    expect(accounts[0].lenses.breadth).toBeNull();
  });
});

describe("computeIntelligence — activation lens", () => {
  it("gives full marks once activation clears the target rate", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Florida", department: "Activated PD", current: 100, prior: 100, firstLogins: 10, activatedOfficers: 8 })],
      opts,
    );
    expect(accounts[0].lenses.activation).toBe(100); // 80% ≥ 60% target → capped
  });

  it("scores zero when no first-time officer activates", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Florida", department: "Stalled PD", current: 100, prior: 100, firstLogins: 12, activatedOfficers: 0 })],
      opts,
    );
    expect(accounts[0].lenses.activation).toBe(0);
  });

  it("leaves activation null when there are no first logins to measure", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Florida", department: "Old PD", current: 100, prior: 100 })],
      opts,
    );
    expect(accounts[0].lenses.activation).toBeNull();
  });
});

describe("computeIntelligence — composite & banding", () => {
  it("blends present lenses by weight, between the weakest and strongest", () => {
    const { accounts } = computeIntelligence(
      [
        acct({
          state: "New York",
          department: "Mixed PD",
          current: 130,
          prior: 100, // momentum 80
          questions: 1000,
          betterAnswers: 90,
          downvotes: 30,
          formOk: 40,
          formFails: 40, // low trust
          pillars: { ask: 1000, documents: 50, workspace: 300, redaction: 80, compliance: 40 }, // high breadth
          firstLogins: 10,
          activatedOfficers: 8, // activation 100
        }),
      ],
      opts,
    );
    const a = accounts[0];
    const present = [a.lenses.momentum, a.lenses.trust, a.lenses.breadth, a.lenses.activation].filter(
      (x): x is number => x != null,
    );
    expect(present).toHaveLength(4);
    expect(a.composite).toBeGreaterThanOrEqual(Math.min(...present));
    expect(a.composite).toBeLessThanOrEqual(Math.max(...present));
  });

  it("bands at the research-backed thresholds: green ≥75, yellow 40–74, red <40", () => {
    const { accounts } = computeIntelligence(
      [
        acct({ state: "MA", department: "Green PD", current: 150, prior: 100 }), // +50 → 100
        acct({ state: "MA", department: "Yellow PD", current: 110, prior: 100 }), // +10 → 60
        acct({ state: "MA", department: "Red PD", current: 65, prior: 100 }), // -35 → 15
      ],
      opts,
    );
    const band = (d: string) => accounts.find((a) => a.department === d)!.band;
    expect(band("Green PD")).toBe("green");
    expect(band("Yellow PD")).toBe("yellow");
    expect(band("Red PD")).toBe("red");
  });

  it("summarizes the book by band", () => {
    const { summary } = computeIntelligence(
      [
        acct({ state: "MA", department: "Green PD", current: 150, prior: 100 }),
        acct({ state: "MA", department: "Yellow PD", current: 110, prior: 100 }),
        acct({ state: "MA", department: "Red PD", current: 65, prior: 100 }),
      ],
      opts,
    );
    expect(summary.bands).toEqual({ green: 1, yellow: 1, red: 1 });
  });
});

function sdt(state: string, department: string, total: number): StateDeptTotal {
  return { state, department, total };
}

describe("buildAccountInputs — joins per-signal segmentation totals into accounts", () => {
  it("derives momentum from the union of current and prior windows", () => {
    const inputs = buildAccountInputs({
      current: [sdt("New York", "Nassau County", 130)],
      prior: [sdt("New York", "Nassau County", 100), sdt("Ohio", "Gone PD", 120)],
    });
    const nassau = inputs.find((a) => a.department === "Nassau County")!;
    const gone = inputs.find((a) => a.department === "Gone PD")!;
    expect(nassau.current).toBe(130);
    expect(nassau.prior).toBe(100);
    // Present in prior only → current defaults to 0 (a vanished account).
    expect(gone.current).toBe(0);
    expect(gone.prior).toBe(120);
  });

  it("attaches pillar usage (ask from the current window) when pillar batches are present", () => {
    const inputs = buildAccountInputs({
      current: [sdt("Texas", "Allen", 500)],
      prior: [sdt("Texas", "Allen", 480)],
      documents: [sdt("Texas", "Allen", 40)],
      workspace: [sdt("Texas", "Allen", 200)],
      redaction: [], // ran, but this account has none
    });
    const a = inputs.find((x) => x.department === "Allen")!;
    expect(a.pillars).toEqual({ ask: 500, documents: 40, workspace: 200, redaction: 0, compliance: 0 });
  });

  it("omits pillars entirely when no pillar batch ran (so breadth stays null)", () => {
    const inputs = buildAccountInputs({
      current: [sdt("Texas", "Allen", 500)],
      prior: [sdt("Texas", "Allen", 480)],
    });
    expect(inputs[0].pillars).toBeUndefined();
  });

  it("attaches trust signals only for batches that succeeded", () => {
    const inputs = buildAccountInputs({
      current: [sdt("MA", "Quincy PD", 1000)],
      prior: [sdt("MA", "Quincy PD", 1000)],
      betterAnswers: [sdt("MA", "Quincy PD", 40)],
      downvotes: [], // ran → 0 for this account
      // formFails batch omitted entirely → field stays undefined
    });
    const a = inputs.find((x) => x.department === "Quincy PD")!;
    expect(a.betterAnswers).toBe(40);
    expect(a.downvotes).toBe(0);
    expect(a.formFails).toBeUndefined();
  });

  it("attaches activation signals when the uniques batches are present", () => {
    const inputs = buildAccountInputs({
      current: [sdt("Florida", "Palm Beach PD", 200)],
      prior: [sdt("Florida", "Palm Beach PD", 180)],
      firstLogins: [sdt("Florida", "Palm Beach PD", 10)],
      activatedOfficers: [sdt("Florida", "Palm Beach PD", 8)],
    });
    const a = inputs.find((x) => x.department === "Palm Beach PD")!;
    expect(a.firstLogins).toBe(10);
    expect(a.activatedOfficers).toBe(8);
  });
});

describe("computeIntelligence — account hygiene (mirrors health board)", () => {
  it("excludes test/demo departments when hideTest is on", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Massachusetts", department: "TEST E2E Department", current: 144, prior: 104 })],
      opts,
    );
    expect(accounts).toHaveLength(0);
  });

  it("excludes rows whose state or department is (none)", () => {
    const { accounts } = computeIntelligence(
      [
        acct({ state: "(none)", department: "Mystery PD", current: 200, prior: 100 }),
        acct({ state: "Massachusetts", department: "(none)", current: 200, prior: 100 }),
      ],
      opts,
    );
    expect(accounts).toHaveLength(0);
  });

  it("keeps same-named departments in different states separate", () => {
    const { accounts } = computeIntelligence(
      [
        acct({ state: "Massachusetts", department: "Lakewood", current: 300, prior: 280 }),
        acct({ state: "New Jersey", department: "Lakewood", current: 35, prior: 0 }),
      ],
      opts,
    );
    expect(accounts).toHaveLength(2);
  });
});
