/**
 * Localized Ask AI reply templates (search summaries, previews, completions).
 */

import type { AssistantActionResult, AssistantIntent } from "@/lib/assistant/types";
import type { ResolvedIntent } from "@/lib/ai/resolve";
import { formatMediaTypeCounts } from "@/lib/ai/media-preference";
import { ASSISTANT_SEARCH_SPARSE_THRESHOLD } from "@/lib/ai/safety";
import { formatSecondaryHelpTip } from "@/lib/ai/help";
import type { TranslateFn } from "@/lib/i18n";
import { publicAssistantErrorMessage } from "@/lib/ai/safety";

function isMemorial(intent: AssistantIntent): boolean {
  return intent.tone === "memorial";
}

function formatVisualRelatedLabel(intent: AssistantIntent): string | null {
  const label =
    intent.visual_query?.trim() ||
    [...(intent.objects ?? []), ...(intent.scenes ?? [])].join(" / ") ||
    intent.qualities?.slice(0, 4).join(" / ");
  return label?.trim() || null;
}

function pluralSuffix(count: number, t: TranslateFn): string {
  // English uses "s"; other locales often leave plural empty in our templates
  // via `{plural}` — for en-US we pass "s" / "".
  return count === 1 ? "" : "s";
}

export function buildClarifyCopy(
  t: TranslateFn,
  intent: AssistantIntent,
  questions: string[],
): string {
  const intro = isMemorial(intent)
    ? t("assistant.reply.clarifyIntroMemorial")
    : t("assistant.reply.clarifyIntro");
  return [intro, ...questions.map((q, i) => `${i + 1}. ${q}`)].join("\n");
}

export function buildSparseCopy(
  t: TranslateFn,
  intent: AssistantIntent,
  summary: string,
  questions: string[],
): string {
  const intro = isMemorial(intent)
    ? t("assistant.reply.sparseIntroMemorial")
    : t("assistant.reply.sparseIntro");
  return [intro, summary, ...questions.map((q) => `• ${q}`)].join("\n");
}

export function buildPreviewCopy(
  t: TranslateFn,
  input: {
    intent: AssistantIntent;
    resolved: ResolvedIntent;
    totalCount: number;
    totalMatched?: number;
    title: string;
    theme?: string;
    mediaItems?: Array<{ type: string }>;
  },
): string {
  const visual = formatVisualRelatedLabel(input.intent);
  const whoNames = input.resolved.matchedPeople.map((p) => p.name);
  const who =
    whoNames.length > 0
      ? whoNames.join(", ")
      : visual
        ? null
        : t("assistant.reply.yourFamily");
  const when = input.resolved.dateFilter?.label
    ? t("assistant.reply.fromWhen", { label: input.resolved.dateFilter.label })
    : "";
  const qualities =
    input.intent.qualities && input.intent.qualities.length > 0 && !visual
      ? t("assistant.reply.qualitiesNote", {
          qualities: input.intent.qualities.join(" and "),
        })
      : "";
  const moreNote =
    input.totalMatched && input.totalMatched > input.totalCount
      ? t("assistant.reply.moreNote", {
          used: input.totalCount,
          matched: input.totalMatched,
        })
      : "";

  const countLabel =
    input.mediaItems && input.mediaItems.length > 0
      ? formatMediaTypeCounts(input.mediaItems)
      : `${input.totalCount} item${input.totalCount === 1 ? "" : "s"}`;

  const featuring = who
    ? t("assistant.reply.featuring", { who })
    : "";

  const foundLine = visual
    ? t("assistant.reply.foundVisual", {
        countLabel,
        visual,
        featuring,
        when,
        moreNote,
      })
    : t("assistant.reply.foundPeople", {
        countLabel,
        who: who ?? t("assistant.reply.yourFamily"),
        when,
        moreNote,
      });

  if (input.intent.action === "create_movie" && isMemorial(input.intent)) {
    return [
      foundLine,
      t("assistant.reply.memorialPreview", {
        title: input.title,
        qualities,
      }),
      t("assistant.reply.replyYesBegin"),
    ].join(" ");
  }

  if (input.intent.action === "create_movie") {
    return [
      foundLine,
      t("assistant.reply.moviePreview", {
        theme: input.theme ?? "simple",
        title: input.title,
        qualities,
      }),
      t("assistant.reply.replyYesCreate"),
    ].join(" ");
  }

  return [
    foundLine,
    t("assistant.reply.memoryPreview", {
      title: input.title,
      qualities,
    }),
    t("assistant.reply.replyYesOrChange"),
  ].join(" ");
}

export function buildPrivateVaultPreviewCopy(
  t: TranslateFn,
  intent: AssistantIntent,
): string {
  switch (intent.action) {
    case "create_document_category":
      return t("assistant.reply.privateCategoryPreview", {
        name: intent.document_category ?? "",
      });
    case "file_private_document":
      return t("assistant.reply.privateFilePreview", {
        document: intent.document_title ?? "",
        category: intent.document_category ?? "",
      });
    case "add_legacy_contact": {
      const asCategory = intent.legacy_contact_category
        ? t("assistant.reply.privateContactAs", {
            category: intent.legacy_contact_category.replace(/_/g, " "),
          })
        : "";
      return t("assistant.reply.privateContactPreview", {
        name: intent.legacy_contact_name ?? "",
        asCategory,
      });
    }
    case "draft_legacy_business":
      return t("assistant.reply.privateBusinessPreview");
    default:
      return t("assistant.reply.privateReadyDefault");
  }
}

export function buildCompletionCopy(
  t: TranslateFn,
  intent: AssistantIntent,
  result: AssistantActionResult,
  fallback: string,
): string {
  if (result.type === "search_media") {
    const visual = formatVisualRelatedLabel(intent);
    const helpAside = formatSecondaryHelpTip(intent.raw_prompt, t) ?? "";
    const countLabel = `${result.count} item${result.count === 1 ? "" : "s"}`;
    if (result.count === 0) {
      const empty = isMemorial(intent)
        ? t("assistant.reply.searchEmptyMemorial")
        : fallback;
      return /\n\nAlso —/.test(empty) || /\n\nAlso /.test(empty)
        ? empty
        : `${empty}${helpAside}`;
    }
    if (visual) {
      if (result.count < ASSISTANT_SEARCH_SPARSE_THRESHOLD) {
        return `${t("assistant.reply.searchFoundVisualSparse", {
          countLabel,
          visual,
        })}${helpAside}`;
      }
      return `${t("assistant.reply.searchFoundVisualFull", {
        countLabel,
        visual,
      })}${helpAside}`;
    }
    if (result.count < ASSISTANT_SEARCH_SPARSE_THRESHOLD) {
      return `${t("assistant.reply.searchFoundSparse", {
        countLabel,
      })}${helpAside}`;
    }
    return `${t("assistant.reply.searchFound", { countLabel })}${helpAside}`;
  }

  if (result.type === "create_memory") {
    const count = result.mediaIds?.length ?? 0;
    return t("assistant.reply.createdMemory", {
      title: result.title ?? t("assistant.reply.defaultMemoryTitle"),
      count,
      plural: pluralSuffix(count, t),
    });
  }

  if (result.type === "create_movie") {
    if (isMemorial(intent)) {
      return t("assistant.reply.startedTribute", {
        title: result.title ?? t("assistant.reply.defaultTributeTitle"),
      });
    }
    return t("assistant.reply.startedSlideshow", {
      title: result.title ?? t("assistant.reply.defaultMovieTitle"),
    });
  }

  if (result.type === "clarify") {
    return buildClarifyCopy(t, intent, result.questions);
  }

  if (result.type === "create_document_category") {
    return t("assistant.reply.createdCategory", { name: result.name });
  }

  if (result.type === "file_private_document") {
    return t("assistant.reply.filedDocument", {
      document: result.documentTitle,
      category: result.categoryName,
    });
  }

  if (result.type === "add_legacy_contact") {
    return t("assistant.reply.addedContact", { name: result.name });
  }

  if (result.type === "draft_legacy_business") {
    return t("assistant.reply.savedBusinessDraft");
  }

  if (result.type === "review_legacy_checklist") {
    return result.missing.length === 0
      ? t("assistant.reply.checklistComplete")
      : t("assistant.reply.checklistProgress", {
          completed: result.completed,
          total: result.total,
        });
  }

  if (result.type === "answer_help") {
    return fallback;
  }

  if (result.type === "error") {
    const safe = publicAssistantErrorMessage(new Error(result.message));
    return isMemorial(intent)
      ? t("assistant.reply.errorMemorial", { safe })
      : safe;
  }

  return fallback;
}
