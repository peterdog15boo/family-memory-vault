import { describe, expect, it } from "vitest";
import {
  computeFamilyTreeCompleteness,
  treeCompletenessEncouragement,
} from "@/lib/family-tree/completeness";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";

function emptyTree(): SerializedFamilyTreeGraph {
  return { nodes: [], relationships: [], derived: [], generations: {} };
}

function node(
  id: string,
  label: string,
  opts: { personId?: string | null; generation?: number } = {},
) {
  const personId = opts.personId ?? null;
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    userId: "u1",
    familyId: "fam1",
    personId,
    label,
    notes: null,
    createdAt: now,
    updatedAt: now,
    isPlaceholder: !personId,
    person: personId
      ? { id: personId, name: label, displayName: label }
      : null,
    generation: opts.generation ?? 0,
    needsReview: false,
    reviewReason: null,
  };
}

function rel(
  id: string,
  type: "parent_of" | "partner_of" | "sibling_of",
  fromNodeId: string,
  toNodeId: string,
) {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    userId: "u1",
    familyId: "fam1",
    type,
    fromNodeId,
    toNodeId,
    partnerStatus: null as "current" | "former" | null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("computeFamilyTreeCompleteness", () => {
  it("starts empty with an add-person next action", () => {
    const snap = computeFamilyTreeCompleteness({
      tree: emptyTree(),
      peopleCount: 0,
      availablePeople: [],
      hasPhotoByPersonId: {},
    });
    expect(snap.percent).toBe(0);
    expect(snap.nextAction.kind).toBe("add_person");
    expect(snap.earnedBadgeIds).toEqual([]);
  });

  it("suggests placing an available person first", () => {
    const snap = computeFamilyTreeCompleteness({
      tree: emptyTree(),
      peopleCount: 2,
      availablePeople: [{ id: "p1", displayName: "Sam" }],
      hasPhotoByPersonId: { p1: true },
    });
    expect(snap.nextAction.kind).toBe("place_person");
    expect(snap.nextAction.title).toContain("Sam");
    expect(snap.metrics.find((m) => m.id === "peoplePlaced")?.percent).toBe(0);
  });

  it("scores placement and photos when people are on the tree", () => {
    const tree: SerializedFamilyTreeGraph = {
      nodes: [
        node("n1", "Sam", { personId: "p1", generation: 0 }),
        node("n2", "Grandpa", { generation: -1 }),
      ],
      relationships: [rel("r1", "parent_of", "n2", "n1")],
      derived: [],
      generations: { n1: 0, n2: -1 },
    };
    const snap = computeFamilyTreeCompleteness({
      tree,
      peopleCount: 2,
      availablePeople: [{ id: "p2", displayName: "Alex" }],
      hasPhotoByPersonId: { p1: true },
    });
    expect(snap.metrics.find((m) => m.id === "peoplePlaced")?.done).toBe(1);
    expect(snap.metrics.find((m) => m.id === "photosOnTree")?.done).toBe(1);
    expect(snap.earnedBadgeIds).toContain("first_branch");
    expect(snap.nextAction.kind).toBe("place_person");
  });

  it("suggests adding parents after people are placed", () => {
    const tree: SerializedFamilyTreeGraph = {
      nodes: [
        node("mom", "Mom", { personId: "p1", generation: 0 }),
        node("kid", "Kid", { personId: "p2", generation: 1 }),
      ],
      relationships: [rel("r1", "parent_of", "mom", "kid")],
      derived: [],
      generations: { mom: 0, kid: 1 },
    };
    const snap = computeFamilyTreeCompleteness({
      tree,
      peopleCount: 2,
      availablePeople: [],
      hasPhotoByPersonId: { p1: true, p2: true },
    });
    expect(snap.nextAction.kind).toBe("add_parents");
    expect(snap.nextAction.title.toLowerCase()).toMatch(/parent/);
  });

  it("earns three-generations and ten-people badges", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      node(`n${i}`, `Person ${i}`, {
        personId: `p${i}`,
        generation: i < 3 ? i : 2,
      }),
    );
    const tree: SerializedFamilyTreeGraph = {
      nodes,
      relationships: [
        rel("r1", "parent_of", "n0", "n1"),
        rel("r2", "parent_of", "n1", "n2"),
      ],
      derived: [],
      generations: Object.fromEntries(nodes.map((n) => [n.id, n.generation])),
    };
    const photos = Object.fromEntries(
      nodes.map((n) => [n.personId!, true]),
    );
    const snap = computeFamilyTreeCompleteness({
      tree,
      peopleCount: 10,
      availablePeople: [],
      hasPhotoByPersonId: photos,
    });
    expect(snap.earnedBadgeIds).toContain("three_generations");
    expect(snap.earnedBadgeIds).toContain("ten_people");
    expect(snap.earnedBadgeIds).toContain("photo_complete_core");
  });
});

describe("treeCompletenessEncouragement", () => {
  it("stays warm at every tier", () => {
    expect(treeCompletenessEncouragement(0).toLowerCase()).toMatch(/plant|start|first/);
    expect(treeCompletenessEncouragement(50).toLowerCase()).not.toMatch(
      /missing|incomplete|fail/,
    );
    expect(treeCompletenessEncouragement(100).toLowerCase()).toMatch(
      /full|wonder/,
    );
  });
});
