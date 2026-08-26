/**
 * Family-tree relationship vocabulary — stored types, labels, and UX choices.
 * Does not invent relationships; only labels what the user assigns.
 */

import {
  FAMILY_TREE_RELATION_TYPES,
  type FamilyTreeRelationType,
} from "@/lib/db/schema";

export const FAMILY_TREE_STORED_RELATION_TYPES = FAMILY_TREE_RELATION_TYPES;

/** Types that keep the user’s from→to direction. */
export const FAMILY_TREE_DIRECTIONAL_TYPES = [
  "parent_of",
  "niece_of",
  "nephew_of",
] as const satisfies readonly FamilyTreeRelationType[];

export type FamilyTreeDirectionalType =
  (typeof FAMILY_TREE_DIRECTIONAL_TYPES)[number];

/** Short edge labels drawn on the canvas. */
export const FAMILY_TREE_RELATION_EDGE_LABELS: Record<
  FamilyTreeRelationType,
  string
> = {
  parent_of: "Parent",
  partner_of: "Partner",
  sibling_of: "Sibling",
  cousin_of: "Cousin",
  niece_of: "Niece",
  nephew_of: "Nephew",
  sister_in_law_of: "Sister-in-law",
  brother_in_law_of: "Brother-in-law",
  other_relative_of: "Other relative",
};

/** Guided connect-flow choices (maps to stored types). */
export type FamilyTreeRelationChoiceId =
  | "parent"
  | "child"
  | "partner"
  | "sibling"
  | "cousin"
  | "niece"
  | "nephew"
  | "sister_in_law"
  | "brother_in_law"
  | "other";

export type FamilyTreeRelationChoice = {
  id: FamilyTreeRelationChoiceId;
  /** “Is the … of” phrasing for the connect picker. */
  label: string;
  hint: string;
  /** Core types shown first; extended under “More”. */
  group: "core" | "extended";
};

export const FAMILY_TREE_RELATION_CHOICES: FamilyTreeRelationChoice[] = [
  {
    id: "parent",
    label: "Is the parent of…",
    hint: "Mom, Dad, Grandma…",
    group: "core",
  },
  {
    id: "child",
    label: "Is the child of…",
    hint: "Son, daughter, grandkid…",
    group: "core",
  },
  {
    id: "partner",
    label: "Is the spouse / partner of…",
    hint: "Married or partners",
    group: "core",
  },
  {
    id: "sibling",
    label: "Is the sibling of…",
    hint: "Brother, sister…",
    group: "core",
  },
  {
    id: "cousin",
    label: "Is the cousin of…",
    hint: "Cousins",
    group: "extended",
  },
  {
    id: "niece",
    label: "Is the niece of…",
    hint: "Niece → aunt or uncle",
    group: "extended",
  },
  {
    id: "nephew",
    label: "Is the nephew of…",
    hint: "Nephew → aunt or uncle",
    group: "extended",
  },
  {
    id: "sister_in_law",
    label: "Is the sister-in-law of…",
    hint: "In-laws",
    group: "extended",
  },
  {
    id: "brother_in_law",
    label: "Is the brother-in-law of…",
    hint: "In-laws",
    group: "extended",
  },
  {
    id: "other",
    label: "Is another relative of…",
    hint: "Less common connection",
    group: "extended",
  },
];

export function isFamilyTreeRelationType(
  value: string,
): value is FamilyTreeRelationType {
  return (FAMILY_TREE_RELATION_TYPES as readonly string[]).includes(value);
}

export function isDirectionalFamilyTreeRelation(
  type: FamilyTreeRelationType,
): boolean {
  return (FAMILY_TREE_DIRECTIONAL_TYPES as readonly string[]).includes(type);
}

/**
 * Normalize undirected edges so (a,b) and (b,a) collapse to one canonical pair.
 * Directional types keep the user’s from → to order.
 */
export function canonicalizeRelationshipEndpoints(
  type: FamilyTreeRelationType,
  fromNodeId: string,
  toNodeId: string,
): { fromNodeId: string; toNodeId: string } {
  if (isDirectionalFamilyTreeRelation(type)) {
    return { fromNodeId, toNodeId };
  }
  if (fromNodeId < toNodeId) {
    return { fromNodeId, toNodeId };
  }
  return { fromNodeId: toNodeId, toNodeId: fromNodeId };
}

/**
 * Resolve a connect-flow choice into a stored edge.
 * Child is stored as inverse parent_of (no separate child type).
 */
export function resolveRelationChoice(
  choiceId: FamilyTreeRelationChoiceId,
  fromNodeId: string,
  toNodeId: string,
): { fromNodeId: string; toNodeId: string; type: FamilyTreeRelationType } {
  switch (choiceId) {
    case "parent":
      return { fromNodeId, toNodeId, type: "parent_of" };
    case "child":
      return { fromNodeId: toNodeId, toNodeId: fromNodeId, type: "parent_of" };
    case "partner":
      return { fromNodeId, toNodeId, type: "partner_of" };
    case "sibling":
      return { fromNodeId, toNodeId, type: "sibling_of" };
    case "cousin":
      return { fromNodeId, toNodeId, type: "cousin_of" };
    case "niece":
      return { fromNodeId, toNodeId, type: "niece_of" };
    case "nephew":
      return { fromNodeId, toNodeId, type: "nephew_of" };
    case "sister_in_law":
      return { fromNodeId, toNodeId, type: "sister_in_law_of" };
    case "brother_in_law":
      return { fromNodeId, toNodeId, type: "brother_in_law_of" };
    case "other":
      return { fromNodeId, toNodeId, type: "other_relative_of" };
  }
}

/**
 * Human phrase from viewer’s perspective toward the other person.
 */
export function describeRelationFromViewer(
  type: FamilyTreeRelationType,
  viewerIsFrom: boolean,
): string {
  switch (type) {
    case "parent_of":
      return viewerIsFrom ? "Parent of" : "Child of";
    case "partner_of":
      return "Partner of";
    case "sibling_of":
      return "Sibling of";
    case "cousin_of":
      return "Cousin of";
    case "niece_of":
      return viewerIsFrom ? "Niece of" : "Aunt/uncle of";
    case "nephew_of":
      return viewerIsFrom ? "Nephew of" : "Aunt/uncle of";
    case "sister_in_law_of":
      return "Sister-in-law of";
    case "brother_in_law_of":
      return "Brother-in-law of";
    case "other_relative_of":
      return "Related to";
  }
}

export function edgeLabelForRelation(type: FamilyTreeRelationType): string {
  return FAMILY_TREE_RELATION_EDGE_LABELS[type];
}
