import { describe, expect, it } from "vitest";
import {
  missingCoParentSpouseIds,
  preferredExistingCoParentId,
  spouseIdsOf,
} from "@/lib/family-tree/co-parents";
import type { CoParentEdge } from "@/lib/family-tree/co-parents";

const edges = (
  rows: Array<[string, string, CoParentEdge["type"]]>,
): CoParentEdge[] =>
  rows.map(([fromNodeId, toNodeId, type]) => ({
    fromNodeId,
    toNodeId,
    type,
  }));

describe("co-parents helpers", () => {
  it("lists spouses of a node", () => {
    expect(
      spouseIdsOf(
        edges([
          ["a", "b", "partner_of"],
          ["a", "c", "parent_of"],
        ]),
        "a",
      ),
    ).toEqual(["b"]);
  });

  it("returns missing spouse co-parents for a new child", () => {
    expect(
      missingCoParentSpouseIds(
        edges([["mom", "dad", "partner_of"]]),
        "mom",
        "kid",
      ),
    ).toEqual(["dad"]);
  });

  it("skips spouses already linked as parents", () => {
    expect(
      missingCoParentSpouseIds(
        edges([
          ["mom", "dad", "partner_of"],
          ["mom", "kid", "parent_of"],
          ["dad", "kid", "parent_of"],
        ]),
        "mom",
        "kid",
      ),
    ).toEqual([]);
  });

  it("prefers an existing spouse when filling a second parent", () => {
    expect(
      preferredExistingCoParentId(
        edges([
          ["mom", "dad", "partner_of"],
          ["mom", "kid", "parent_of"],
        ]),
        "kid",
      ),
    ).toBe("dad");
  });

  it("returns null when no spouse can fill the parent slot", () => {
    expect(
      preferredExistingCoParentId(
        edges([["mom", "kid", "parent_of"]]),
        "kid",
      ),
    ).toBeNull();
  });
});
