/**
 * Client-safe tags / titles for Will Planner ↔ Private Documents links.
 */

export const WILL_PLANNER_DOCUMENT_TAG = "will-planner-draft";
export const WILL_DRAFT_ID_TAG_PREFIX = "will-draft:";

export function willDraftIdTag(draftId: string): string {
  return `${WILL_DRAFT_ID_TAG_PREFIX}${draftId}`;
}

export function parseWillDraftIdFromTags(
  tags: string[] | null | undefined,
): string | null {
  if (!tags?.length) return null;
  for (const tag of tags) {
    if (tag.startsWith(WILL_DRAFT_ID_TAG_PREFIX)) {
      const id = tag.slice(WILL_DRAFT_ID_TAG_PREFIX.length).trim();
      if (id) return id;
    }
  }
  return null;
}

export function buildWillPlannerDocumentTitle(input: {
  legalName: string;
  generatedAt: Date;
}): string {
  const name = input.legalName.trim() || "Untitled";
  const date = input.generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `Will planner draft — ${name} — ${date}`;
}
