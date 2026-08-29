import { describe, expect, it } from "vitest";
import { familyTreeAccessFromMembership } from "@/lib/family-tree/access";

const familyA = {
  familyId: "fam-a",
  familyName: "Roberts",
  peopleOwnerId: "owner-a",
  treeSharedWithFamily: true,
  membersCanEditTree: false,
  role: "member" as const,
  hasTree: true,
};

const familyB = {
  familyId: "fam-b",
  familyName: "Smith",
  peopleOwnerId: "owner-b",
  treeSharedWithFamily: true,
  membersCanEditTree: false,
  role: "member" as const,
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

  it("lets shared members view but not edit when membersCanEdit is off", () => {
    const access = familyTreeAccessFromMembership(familyA, "member-a");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.shareWithMembers).toBe(true);
    expect(access.membersCanEdit).toBe(false);
  });

  it("allows member edit when share and membersCanEdit are both on", () => {
    const access = familyTreeAccessFromMembership(
      { ...familyA, membersCanEditTree: true },
      "member-a",
    );
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });

  it("share off hides the tree from members even if they are invited", () => {
    const access = familyTreeAccessFromMembership(
      {
        ...familyA,
        treeSharedWithFamily: false,
        membersCanEditTree: true,
        canViewTree: true,
        canContributeTree: true,
      },
      "member-a",
    );
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
  });

  it("membersCanEdit alone does not grant edit without share", () => {
    const access = familyTreeAccessFromMembership(
      {
        ...familyA,
        treeSharedWithFamily: false,
        membersCanEditTree: true,
      },
      "member-a",
    );
    expect(access.canEdit).toBe(false);
  });

  it("viewers cannot edit even when membersCanEdit is on", () => {
    const access = familyTreeAccessFromMembership(
      {
        ...familyA,
        membersCanEditTree: true,
        role: "viewer",
      },
      "member-a",
    );
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
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

  it("creator always sees and edits when share is off", () => {
    const access = familyTreeAccessFromMembership(
      {
        ...familyA,
        treeSharedWithFamily: false,
        membersCanEditTree: false,
        role: "owner",
      },
      "owner-a",
    );
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });
});
