/**
 * Intent-aware empty / fallback Ask AI replies.
 *
 * Object/scene → visual miss copy (never People / “anyone named”).
 * Person → People-list / face-assignment guidance.
 * Help → left to product help (answer_help).
 */

import type { AskIntentKind } from "@/lib/ai/intent";
import { suggestVisualAlternatives } from "@/lib/ai/visual-search";
import type { MatchedPerson, UnresolvedPerson } from "@/lib/ai/resolve";
import {
  assessVisualLabelCoverage,
  shouldIncludeVisualCoverageAdminHint,
  visualCoverageAdminEnqueueHint,
  type VisualCoverageAssessment,
} from "@/lib/ai/visual-coverage";

export type EmptyReplyKind = "object_scene" | "person" | "generic";

export type EmptySearchReply = {
  kind: EmptyReplyKind;
  summary: string;
  suggestions: string[];
  /** True when object/scene miss is likely due to sparse visual labels. */
  lowVisualCoverage?: boolean;
};

/** “toilet” → “a toilet”; “beach photos” left as-is; plurals/adverbs unchanged. */
export function formatObjectScenePhrase(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) return "that";
  if (/^(?:a|an|the)\s+/i.test(trimmed)) return trimmed.toLowerCase();

  const lower = trimmed.toLowerCase();
  if (
    /^(indoors?|outdoors?|inside|outside|interior|exterior)$/i.test(lower)
  ) {
    return lower;
  }
  // Multi-word phrases usually read fine without an article.
  if (/\s/.test(lower)) return lower;
  // Plurals
  if (lower.length > 3 && lower.endsWith("s") && !lower.endsWith("ss")) {
    return lower;
  }
  const article = /^[aeiou]/i.test(lower) ? "an" : "a";
  return `${article} ${lower}`;
}

export function resolveEmptyReplyKind(
  intentKind: AskIntentKind | undefined,
): EmptyReplyKind {
  if (intentKind === "object_search" || intentKind === "scene_search") {
    return "object_scene";
  }
  if (intentKind === "person_search" || intentKind === "mixed") {
    return "person";
  }
  return "generic";
}

function primaryPersonName(input: {
  matchedPeople?: MatchedPerson[];
  unresolvedPeople?: UnresolvedPerson[];
  peopleNames?: string[];
}): string | null {
  const matched = input.matchedPeople?.[0]?.name?.trim();
  if (matched) return matched;
  const unresolved = input.unresolvedPeople?.[0]?.query?.trim();
  if (unresolved) return unresolved;
  const fromIntent = input.peopleNames?.find((n) => n.trim());
  return fromIntent?.trim() || null;
}

function visualLabelFromParts(input: {
  visualQuery?: string | null;
  objects?: string[];
  scenes?: string[];
}): string | null {
  const q = input.visualQuery?.trim();
  if (q) return q;
  const parts = [...(input.objects ?? []), ...(input.scenes ?? [])]
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Object/scene empty library reply. */
export function buildObjectSceneEmptyReply(input: {
  visualQuery?: string | null;
  objects?: string[];
  scenes?: string[];
  labelsStillProcessing?: boolean;
  /** Precomputed coverage; when omitted, derived from totals if provided. */
  coverage?: VisualCoverageAssessment | null;
  cleanReadyTotal?: number;
  visualLabeledTotal?: number;
  visualUnlabeledTotal?: number;
  /** Include admin/dev enqueue hint (defaults to NODE_ENV=development). */
  includeAdminHint?: boolean;
}): EmptySearchReply {
  const raw = visualLabelFromParts(input);
  const phrase = formatObjectScenePhrase(raw ?? "that");
  const summary = `I couldn’t find photos of ${phrase} in your library yet.`;

  const coverage =
    input.coverage ??
    (input.cleanReadyTotal != null && input.visualLabeledTotal != null
      ? assessVisualLabelCoverage({
          cleanReadyTotal: input.cleanReadyTotal,
          visualLabeledTotal: input.visualLabeledTotal,
          visualUnlabeledTotal: input.visualUnlabeledTotal,
        })
      : null);

  const lowVisualCoverage = Boolean(
    coverage?.lowCoverage || input.labelsStillProcessing,
  );

  const suggestions: string[] = [];

  if (coverage?.lowCoverage && coverage.coverageNote) {
    suggestions.push(
      `Some photos may still need visual analysis — ${coverage.coverageNote}`,
    );
    suggestions.push(
      "Object and scene search works best after ai_tags / ai_objects / ai_scenes are filled in. Try again once more photos are analyzed.",
    );
  } else if (input.labelsStillProcessing) {
    suggestions.push(
      "Some photos may still need visual analysis — wait a bit, then try again.",
    );
  }

  suggestions.push("Upload more photos that might include this.");
  if (raw) {
    suggestions.push(
      `Or open the photo and add a tag like “${raw}” — manual tags are searched the same way.`,
    );
  } else {
    suggestions.push(
      "Or add a keyword tag on the photo (Photos → Edit tags) so Ask AI can find it.",
    );
  }

  if (raw) {
    const related = suggestVisualAlternatives(raw)
      .map((s) => s.replace(/^try\s+/i, "").replace(/[“”"]/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (related.length > 0) {
      suggestions.push(`Try related terms: ${related.join(", ")}.`);
    } else {
      suggestions.push(
        "Try related terms (for example a simpler object or scene word).",
      );
    }
  } else {
    suggestions.push(
      "Try related terms (for example cake, beach, dog, kitchen, or party).",
    );
  }

  if (
    !coverage?.lowCoverage &&
    !input.labelsStillProcessing
  ) {
    suggestions.push(
      "If you uploaded recently, wait until visual analysis finishes, then try again.",
    );
  }

  if (
    lowVisualCoverage &&
    shouldIncludeVisualCoverageAdminHint(input.includeAdminHint)
  ) {
    suggestions.push(visualCoverageAdminEnqueueHint());
  }

  return {
    kind: "object_scene",
    summary,
    suggestions,
    lowVisualCoverage,
  };
}

/** Person empty / not-found reply — never used for object/scene asks. */
export function buildPersonEmptyReply(input: {
  matchedPeople?: MatchedPerson[];
  unresolvedPeople?: UnresolvedPerson[];
  peopleNames?: string[];
  /** Matched in People but no linked media / faces. */
  hasCatalogMatch?: boolean;
}): EmptySearchReply {
  const name = primaryPersonName(input) ?? "that person";
  const notInPeople =
    !input.hasCatalogMatch &&
    (Boolean(input.unresolvedPeople?.some((u) => u.reason === "not_found")) ||
      !input.matchedPeople?.length);

  const summary = notInPeople
    ? `I couldn’t find anyone named ${name} in People.`
    : `I couldn’t find photos linked to ${name} yet.`;

  const suggestions = [
    "Check People for the right spelling, nickname, or duplicate card.",
    "Manually assign faces to that person from People or the media viewer.",
  ];

  return { kind: "person", summary, suggestions };
}

/**
 * Choose empty-search copy from Ask AI intent kind.
 * Object/scene never returns person / “anyone named” messaging.
 */
export function buildEmptySearchReply(input: {
  intentKind?: AskIntentKind;
  visualQuery?: string | null;
  objects?: string[];
  scenes?: string[];
  matchedPeople?: MatchedPerson[];
  unresolvedPeople?: UnresolvedPerson[];
  peopleNames?: string[];
  labelsStillProcessing?: boolean;
  coverage?: VisualCoverageAssessment | null;
  cleanReadyTotal?: number;
  visualLabeledTotal?: number;
  visualUnlabeledTotal?: number;
  includeAdminHint?: boolean;
  /** True when resolve matched at least one catalog person. */
  hasCatalogMatch?: boolean;
}): EmptySearchReply {
  const kind = resolveEmptyReplyKind(input.intentKind);

  if (kind === "object_scene") {
    return buildObjectSceneEmptyReply(input);
  }

  if (kind === "person") {
    return buildPersonEmptyReply(input);
  }

  // Generic / clarify / other — prefer visual wording when a visual label exists.
  if (visualLabelFromParts(input) && !input.matchedPeople?.length) {
    return buildObjectSceneEmptyReply(input);
  }
  if (input.matchedPeople?.length || input.peopleNames?.length) {
    return buildPersonEmptyReply({
      ...input,
      hasCatalogMatch: input.hasCatalogMatch ?? Boolean(input.matchedPeople?.length),
    });
  }
  return buildObjectSceneEmptyReply(input);
}

/** Format empty search reply for the assistant message body. */
export function formatEmptySearchMessage(reply: EmptySearchReply): string {
  return [reply.summary, ...reply.suggestions.map((s) => `• ${s}`)].join("\n");
}
