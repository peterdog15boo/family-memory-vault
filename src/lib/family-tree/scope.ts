/**
 * Family Tree scope — one tree per family.
 * peopleOwnerId is the vault used for People links (usually the family creator).
 */

export type FamilyTreeScope = {
  familyId: string;
  peopleOwnerId: string;
};

export function isFamilyTreeScope(value: unknown): value is FamilyTreeScope {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as FamilyTreeScope).familyId === "string" &&
    typeof (value as FamilyTreeScope).peopleOwnerId === "string"
  );
}
