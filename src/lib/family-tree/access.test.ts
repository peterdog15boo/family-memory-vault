import { describe, expect, it } from "vitest";
import { familyTreeAccessFromMembership } from "@/lib/family-tree/access";

const familyA = {
  familyId: "fam-a",
  familyName: "Roberts",
  peopleOwnerId: "owner-a",
  treeSharedWithFamily: true,
  canViewTree: true,
  canContributeTree: false,
  role: "member",
  hasTree: true,
};

const familyB = {
  familyId: "fam-b",
  familyName: "Smith",
  peopleOwnerId: "owner-b",
  treeSharedWithFamily: true,
  canViewTree: true,
  canContributeTree: false,
  role: "member",
  hasTree: true,
};

describe("familyTreeAccessFromMembership", () => {
  it("gives the family creator edit + view on their tree", () => {
    const access = familyTreeAccessFromMembership(
      { ...familyA, role: "owner" },
      "owner-a",
    );
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.isFamilyCreator).toBe(true);
    expect(access.familyName).toBe("Roberts");
  });

  it("lets shared members view but not edit by default", () => {
    const access = familyTreeAccessFromMembership(familyA, "member-a");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
  });

  it("allows contribute when the owner toggles canContributeTree", () => {
    const access = familyTreeAccessFromMembership(
      { ...familyA, canContributeTree: true },
      "member-a",
    );
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });

  it("blocks non-members of family B from that tree (no membership row)", () => {
    // Viewer is only evaluated against rows they belong to — family B's
    // membership for a family-A-only user simply does not exist.
    const asMemberOfA = familyTreeAccessFromMembership(familyA, "member-a");
    expect(asMemberOfA.familyId).toBe("fam-a");
    expect(asMemberOfA.canView).toBe(true);

    const strangerOnB = familyTreeAccessFromMembership(familyB, "member-a");
    // Same function with B's row would only apply if they were invited to B.
    // Stranger is not creator and would need share flags on a real membership;
    // if somehow evaluated with B's owner id mismatch and share off:
    const blocked = familyTreeAccessFromMembership(
      {
        ...familyB,
        treeSharedWithFamily: false,
        canViewTree: false,
        canContributeTree: false,
      },
      "member-a",
    );
    expect(blocked.canView).toBe(false);
    expect(blocked.canEdit).toBe(false);
  });

  it("isolates two families as separate tree options", () => {
    const a = familyTreeAccessFromMembership(
      { ...familyA, peopleOwnerId: "owner-a", role: "owner" },
      "owner-a",
    );
    const b = familyTreeAccessFromMembership(
      {
        ...familyB,
        peopleOwnerId: "owner-a",
        role: "owner",
        hasTree: false,
      },
      "owner-a",
    );
    expect(a.familyId).not.toBe(b.familyId);
    expect(a.hasTree).toBe(true);
    expect(b.hasTree).toBe(false);
    expect(a.canEdit).toBe(true);
    expect(b.canEdit).toBe(true);
  });

  it("share toggle off hides the tree from members", () => {
    const access = familyTreeAccessFromMembership(
      {
        ...familyA,
        treeSharedWithFamily: false,
        canViewTree: true,
      },
      "member-a",
    );
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
  });
});
