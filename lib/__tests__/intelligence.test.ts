import { describe, expect, it } from "vitest";

import {
  bandFor,
  buildAccountInputs,
  computeIntelligence,
  INTELLIGENCE_DEFAULTS,
  recommend,
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
    expect(a.lenses.activity).toBe(60); // single account → neutral activity (no peers)
    expect(a.lenses.trust).toBeNull();
    expect(a.lenses.breadth).toBeNull();
    expect(a.lenses.activation).toBeNull();
    // Composite blends usage trend (80) with neutral activity (60).
    expect(a.composite).toBe(66);
    expect(a.band).toBe("green");
  });

  it("scores a steep decliner low and bands it red", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Colorado", department: "Castle Rock PD", current: 60, prior: 100 })],
      opts,
    );
    expect(accounts[0].status).toBe("decliner");
    expect(accounts[0].composite).toBe(34); // steep decline (momentum 10) + neutral solo activity (60)
    expect(accounts[0].band).toBe("red");
  });

  it("treats a near-zero-prior surge as newly activated", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "New Jersey", department: "Lakewood", current: 200, prior: 1 })],
      opts,
    );
    expect(accounts[0].status).toBe("new");
    expect(accounts[0].composite).toBe(64); // new-account momentum 72 + neutral solo activity 60
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

describe("computeIntelligence — realization lens (outcomes shipped)", () => {
  it("scores an account that ships outcomes above one that only asks questions", () => {
    const base = { state: "Texas", current: 1000, prior: 1000, questions: 1000 };
    const { accounts } = computeIntelligence(
      [
        acct({ ...base, department: "Shipper PD", formsAiFilled: 40, formsEmailed: 80, artifactsExported: 12 }),
        acct({ ...base, department: "Browser PD", formsAiFilled: 0, formsEmailed: 0, artifactsExported: 0 }),
      ],
      opts,
    );
    const ship = accounts.find((a) => a.department === "Shipper PD")!;
    const browse = accounts.find((a) => a.department === "Browser PD")!;
    expect(ship.lenses.realization).not.toBeNull();
    expect(ship.lenses.realization!).toBeGreaterThan(browse.lenses.realization!);
  });

  it("rewards a higher outcome-per-usage density with a higher realization score", () => {
    const { accounts } = computeIntelligence(
      [
        // same shipped outcomes, but far less usage → denser value conversion
        acct({ state: "Ohio", department: "Dense PD", current: 200, prior: 200, questions: 200, formsEmailed: 40 }),
        acct({ state: "Ohio", department: "Sparse PD", current: 4000, prior: 4000, questions: 4000, formsEmailed: 40 }),
      ],
      opts,
    );
    const dense = accounts.find((a) => a.department === "Dense PD")!;
    const sparse = accounts.find((a) => a.department === "Sparse PD")!;
    expect(dense.lenses.realization!).toBeGreaterThan(sparse.lenses.realization!);
  });

  it("grades value delivered on a curve vs peers — top shippers rank high, light ones get partial credit", () => {
    // Most of the book ships nothing; several ship at a range of volumes. The
    // heaviest shipper should rank near the top of the curve, the lightest
    // should still get partial (non-zero) credit, and a non-shipper stays at 0.
    const zeros = Array.from({ length: 8 }, (_, i) =>
      acct({ state: "MA", department: `Zero ${i} PD`, current: 1000, prior: 1000, questions: 1000, formsEmailed: 0 }),
    );
    // six shippers ramping light → heavy at the same usage (so volume ≈ density)
    const shippers = [10, 18, 26, 34, 45, 80].map((n, i) =>
      acct({ state: "MA", department: `Ship ${i} PD`, current: 1000, prior: 1000, questions: 1000, formsEmailed: n }),
    );
    const { accounts } = computeIntelligence([...zeros, ...shippers], opts);
    const byDept = (d: string) => accounts.find((a) => a.department === d)!;
    const heavy = byDept("Ship 5 PD"); // 80 forms — top on both volume and density
    const light = byDept("Ship 0 PD"); // 10 forms — bottom shipper
    expect(heavy.lenses.realization!).toBeGreaterThanOrEqual(85); // top shipper anchors high
    expect(light.lenses.realization!).toBeGreaterThan(0); // partial credit, not floored away
    expect(light.lenses.realization!).toBeLessThan(heavy.lenses.realization!);
    expect(byDept("Zero 0 PD").lenses.realization!).toBe(0); // non-shippers stay at zero
  });

  it("counts compliance outcomes (signoffs, redactions) as value delivered", () => {
    // The core sold value is accreditation/policy sign-off; a signoff-heavy
    // agency ships real outcomes even with zero AI-form/export activity.
    const { accounts } = computeIntelligence(
      [
        acct({ state: "TX", department: "Signoff-heavy PD", current: 1000, prior: 1000, questions: 1000, signoffs: 200, pillars: { ask: 1000, documents: 0, workspace: 0, redaction: 40, compliance: 200 } }),
        acct({ state: "TX", department: "Idle PD", current: 1000, prior: 1000, questions: 1000, signoffs: 0, pillars: { ask: 1000, documents: 0, workspace: 0, redaction: 0, compliance: 0 } }),
      ],
      opts,
    );
    const sh = accounts.find((a) => a.department === "Signoff-heavy PD")!;
    const idle = accounts.find((a) => a.department === "Idle PD")!;
    expect(sh.lenses.realization!).toBeGreaterThan(0);
    expect(sh.lenses.realization!).toBeGreaterThan(idle.lenses.realization!);
  });

  it("excludes value delivered from the health score — it is upside, not health", () => {
    // Two accounts identical on engagement (usage/quality/adoption) but wildly
    // different on outcomes shipped. For a Q&A-first product, both are equally
    // healthy; value delivered is expansion upside, shown but not scored into health.
    const base = {
      state: "OH",
      current: 1000,
      prior: 1000,
      questions: 1000,
      formOk: 100,
      formFails: 0,
      pillars: { ask: 1000, documents: 40, workspace: 0, redaction: 0, compliance: 0 },
    } as const;
    const { accounts } = computeIntelligence(
      [
        acct({ ...base, department: "Ships PD", formsEmailed: 300 }),
        acct({ ...base, department: "NoShip PD", formsEmailed: 0 }),
      ],
      opts,
    );
    const ships = accounts.find((a) => a.department === "Ships PD")!;
    const noship = accounts.find((a) => a.department === "NoShip PD")!;
    expect(ships.lenses.realization!).toBeGreaterThan(noship.lenses.realization!); // value differs
    expect(ships.composite).toBe(noship.composite); // ...but health is identical
  });

  it("leaves realization null when no outcome signals are supplied", () => {
    const { accounts } = computeIntelligence(
      [acct({ state: "Maine", department: "Quiet PD", current: 300, prior: 280 })],
      opts,
    );
    expect(accounts[0].lenses.realization).toBeNull();
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

  it("bands by the calibrated thresholds: green ≥66, yellow 40–65, red <40", () => {
    expect(bandFor(100)).toBe("green");
    expect(bandFor(66)).toBe("green");
    expect(bandFor(65)).toBe("yellow");
    expect(bandFor(40)).toBe("yellow");
    expect(bandFor(39)).toBe("red");
    expect(bandFor(0)).toBe("red");
  });

  it("penalizes a one-dimensional account: elite usage & answer quality but ask-only stays out of green", () => {
    // Perfect usage trend and answer quality, but the agency only uses Ask — so
    // feature adoption is near-zero. The geometric mean must let that one dead
    // lens drag it out of green; being great at two things can't hide a third
    // that's dead. (The prod-relevant dead lens, since onboarding is absent in
    // prod and reweights away.)
    const { accounts } = computeIntelligence(
      [
        acct({
          state: "Nevada",
          department: "One-Trick PD",
          current: 200,
          prior: 100, // momentum 100
          questions: 1000,
          betterAnswers: 0,
          downvotes: 0,
          formOk: 100,
          formFails: 0, // trust 100
          pillars: { ask: 1000, documents: 0, workspace: 0, redaction: 0, compliance: 0 }, // ask-only → low breadth
        }),
      ],
      opts,
    );
    const a = accounts[0];
    expect(a.lenses.momentum).toBe(100);
    expect(a.lenses.trust).toBe(100);
    expect(a.lenses.breadth!).toBeLessThan(30);
    // The dead feature-adoption lens pulls a 2-lens-perfect account out of green.
    expect(a.band).not.toBe("green");
    expect(a.composite).toBeLessThan(66);
  });

  it("scores a barely-used account low even with no decline or friction (activity level)", () => {
    // The quiet account has great RATES — no decline, zero friction — but tiny
    // absolute usage. Low adoption is the top churn signal, so it must score
    // below the busy accounts, not at the neutral middle.
    const busy = Array.from({ length: 6 }, (_, i) =>
      acct({ state: "MA", department: `Busy ${i} PD`, current: 500, prior: 480, questions: 500 }),
    );
    const quiet = acct({ state: "MA", department: "Barely PD", current: 6, prior: 5, questions: 6 });
    const { accounts } = computeIntelligence([...busy, quiet], opts);
    const q = accounts.find((a) => a.department === "Barely PD")!;
    const b = accounts.find((a) => a.department === "Busy 0 PD")!;
    expect(q.lenses.activity).toBeLessThan(b.lenses.activity);
    expect(q.composite).toBeLessThan(b.composite);
    expect(q.band).not.toBe("green");
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

describe("recommend — the prescriptive 'so-what' next play per account", () => {
  const reco = (partial: Partial<AccountInput> & Pick<AccountInput, "state" | "department">) =>
    recommend(computeIntelligence([acct(partial)], opts).accounts[0]);

  it("tells a newly-activated account to onboard & nurture", () => {
    expect(reco({ state: "NJ", department: "Lakewood", current: 200, prior: 1 }).kind).toBe("onboard");
  });

  it("flags a decliner for intervention regardless of other lenses", () => {
    expect(reco({ state: "CO", department: "Castle Rock PD", current: 60, prior: 100 }).kind).toBe("intervene");
  });

  it("calls out value realization when outcomes lag despite healthy usage", () => {
    // stable usage, clean trust, some breadth, but zero outcomes shipped → realization is the weakest lens
    const r = reco({
      state: "MA",
      department: "Busy-but-empty PD",
      current: 110,
      prior: 100,
      questions: 1000,
      formOk: 100,
      formFails: 0,
      pillars: { ask: 1000, documents: 30, workspace: 0, redaction: 0, compliance: 0 },
      formsEmailed: 0,
      artifactsExported: 0,
      formsAiFilled: 0,
    });
    expect(r.kind).toBe("realization");
  });

  it("recommends cross-selling pillars to a high-momentum, ask-only account", () => {
    const r = reco({
      state: "TX",
      department: "Ask-only PD",
      current: 130,
      prior: 100, // +30 → riser, momentum 80
      pillars: { ask: 130, documents: 0, workspace: 0, redaction: 0, compliance: 0 }, // breadth weakest
    });
    expect(r.kind).toBe("cross-sell");
  });

  it("treats a strong, broad account as an expansion reference", () => {
    // Needs lower-volume peers that also ship modestly, so the all-star ranks
    // HIGH on both activity and value delivered (a solo account / solo shipper
    // gets only a neutral score on those peer-ranked lenses).
    const peers = Array.from({ length: 5 }, (_, i) =>
      acct({ state: "OH", department: `Small ${i} PD`, current: 200, prior: 200, questions: 200, formsEmailed: 10 }),
    );
    const allstar = acct({
      state: "OH",
      department: "All-Star PD",
      current: 1500,
      prior: 1000, // riser → momentum 100, top volume → activity high
      questions: 1500,
      formOk: 100,
      formFails: 0,
      pillars: { ask: 1500, documents: 40, workspace: 200, redaction: 60, compliance: 90 },
      formsEmailed: 200,
      artifactsExported: 30,
      formsAiFilled: 50,
      firstLogins: 10,
      activatedOfficers: 9,
    });
    const { accounts } = computeIntelligence([...peers, allstar], opts);
    const r = recommend(accounts.find((a) => a.department === "All-Star PD")!);
    expect(r.kind).toBe("reference");
  });
});

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

  it("attaches realization outcomes when the outcome batches ran", () => {
    const inputs = buildAccountInputs({
      current: [sdt("Texas", "Allen", 500)],
      prior: [sdt("Texas", "Allen", 480)],
      formsAiFilled: [sdt("Texas", "Allen", 12)],
      formsEmailed: [sdt("Texas", "Allen", 30)],
      artifactsExported: [], // ran → 0 for this account
    });
    const a = inputs.find((x) => x.department === "Allen")!;
    expect(a.formsAiFilled).toBe(12);
    expect(a.formsEmailed).toBe(30);
    expect(a.artifactsExported).toBe(0);
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
