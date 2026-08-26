import { describe, expect, it } from "vitest";
import {
  pickParentIdForCousinSide,
  shouldAskCousinSide,
} from "@/lib/family-tree/cousin-side";

describe("cousin side helpers", () => {
  it("asks for side when two parents exist and side is unset", () => {
    expect(shouldAskCousinSide(["mom", "dad"], undefined)).toBe(true);
    expect(shouldAskCousinSide(["mom", "dad"], "maternal")).toBe(false);
    expect(shouldAskCousinSide(["mom"], undefined)).toBe(false);
  });

  it("picks Mom for maternal and Dad for paternal by label", () => {
    const parents = [
      { id: "m", label: "Mom" },
      { id: "d", label: "Dad" },
    ];
    expect(pickParentIdForCousinSide(parents, "maternal")).toBe("m");
    expect(pickParentIdForCousinSide(parents, "paternal")).toBe("d");
    expect(pickParentIdForCousinSide(parents, "unknown")).toBe("m");
  });
});
