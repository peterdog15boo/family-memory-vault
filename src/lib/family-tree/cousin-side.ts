/**
 * Cousin-side hints for Genealogy Relationship Engine scaffolding.
 * Not stored on edges — only guides which parent becomes the bridge.
 */

export const COUSIN_SIDES = ["maternal", "paternal", "unknown"] as const;
export type CousinSide = (typeof COUSIN_SIDES)[number];

export function isCousinSide(value: unknown): value is CousinSide {
  return (
    typeof value === "string" &&
    (COUSIN_SIDES as readonly string[]).includes(value)
  );
}

const MATERNAL_LABEL = /^(mom|mother|mama|mum|ma)\b/i;
const PATERNAL_LABEL = /^(dad|father|papa|pa|pop)\b/i;

export type CousinSideNode = {
  id: string;
  label: string;
};

/**
 * True when connecting a cousin should ask maternal/paternal/unknown —
 * the person already has two (or more) parents and side is not specified.
 */
export function shouldAskCousinSide(
  parentIds: readonly string[],
  side: CousinSide | undefined,
): boolean {
  if (side) return false;
  return parentIds.length >= 2;
}

/**
 * Pick which existing parent should bridge a cousin link for the given side.
 */
export function pickParentIdForCousinSide(
  parents: readonly CousinSideNode[],
  side: CousinSide | undefined,
): string | null {
  if (parents.length === 0) return null;
  if (parents.length === 1) return parents[0]!.id;

  const resolved: CousinSide = side ?? "unknown";
  if (resolved === "unknown") return parents[0]!.id;

  if (resolved === "maternal") {
    const mom = parents.find((p) => MATERNAL_LABEL.test(p.label.trim()));
    if (mom) return mom.id;
    return parents[0]!.id;
  }

  const dad = parents.find((p) => PATERNAL_LABEL.test(p.label.trim()));
  if (dad) return dad.id;
  return parents[parents.length - 1]!.id;
}

export function cousinSidePromptMessage(personLabel: string): string {
  return `Which side of ${personLabel} is this cousin from?`;
}
