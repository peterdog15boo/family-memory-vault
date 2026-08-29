import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WILL_EXECUTION_BY_STATE,
  WILL_SIGNING_PANEL_DISCLAIMER,
  getWillExecutionForState,
} from "@/lib/legacy/will-execution-by-state";

describe("will execution by state", () => {
  it("covers all 50 states + DC", () => {
    expect(Object.keys(WILL_EXECUTION_BY_STATE)).toHaveLength(51);
  });

  it("TX panel data: two witnesses, self-proving, notary not witness, community property", () => {
    const tx = getWillExecutionForState("TX");
    expect(tx.witnesses).toBe("two");
    expect(tx.selfProving).toBe("recommended");
    expect(tx.notaryOnWill).toBe("not_required");
    expect(tx.communityProperty).toBe(true);
    const text = tx.bullets.join(" ");
    expect(text).toMatch(/two/i);
    expect(text).toMatch(/self-proving/i);
    expect(text).toMatch(/notary is NOT a substitute/i);
    expect(text).toMatch(/community property/i);
    expect(tx.caution).toMatch(/community property/i);
  });

  it("LA panel: notary + two witnesses; not a simple attested will", () => {
    const la = getWillExecutionForState("LA");
    expect(la.witnesses).toBe("attorney");
    expect(la.notaryOnWill).toBe("required_notarial");
    expect(la.communityProperty).toBe(true);
    const text = la.bullets.join(" ");
    expect(text).toMatch(/notary/i);
    expect(text).toMatch(/two witnesses/i);
    expect(text.toLowerCase()).not.toMatch(/simple attested/);
    expect(la.caution).toMatch(/simple attested/i);
  });

  it("default state (AL): two witnesses and optional/recommended self-proving", () => {
    const al = getWillExecutionForState("AL");
    expect(al.witnesses).toBe("two");
    expect(al.selfProving).toBe("recommended");
    expect(al.notaryOnWill).toBe("not_required");
    const text = al.bullets.join(" ");
    expect(text).toMatch(/two adult witnesses/i);
    expect(text).toMatch(/self-proving/i);
  });

  it("missing domicile falls back to default two-witness card", () => {
    const def = getWillExecutionForState(null);
    expect(def.stateCode).toBe("DEFAULT");
    expect(def.witnesses).toBe("two");
    expect(def.bullets.join(" ")).toMatch(/two adult witnesses/i);
  });
});

describe("WillSigningPanel educational posture", () => {
  it("exports the panel disclaimer and UI has no executed/valid controls", () => {
    expect(WILL_SIGNING_PANEL_DISCLAIMER).toMatch(/planning draft/i);
    expect(WILL_SIGNING_PANEL_DISCLAIMER).toMatch(/not a will/i);

    const panelSrc = readFileSync(
      join(process.cwd(), "src/components/will-planner/WillSigningPanel.tsx"),
      "utf8",
    );
    expect(panelSrc).toContain("WILL_SIGNING_PANEL_DISCLAIMER");
    expect(panelSrc).not.toMatch(/type=["']checkbox["']/);
    expect(panelSrc.toLowerCase()).not.toMatch(/this will is valid/);
    expect(panelSrc.toLowerCase()).not.toMatch(/mark as executed/);
    expect(panelSrc.toLowerCase()).not.toMatch(/remote witness/);

    const fl = getWillExecutionForState("FL");
    expect(fl.eWills).toBe("maybe_ask_attorney");
  });
});
