/**
 * Assistant media selection — query clean/ready media the user can access
 * (own library + family-shared co-member media).
 *
 * Safety:
 * - Always scopes via `getAccessibleMediaFilter` (clean + ready + owner ids).
 * - People filters use faces owned by the same userId (People stay private).
 * - `textHints` / visual fields match filename + AI visual metadata
 *   (ai_caption/tags/objects/scenes/description and legacy scene_*)
 *   plus manual `user_tags` (first-class for object/scene recall).
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import {
  loadCleanAccessibleMediaByIds,
  toSafeMediaItem,
  type SafeMediaItem,
} from "@/lib/media/queries";
import { getAccessibleMediaFilter } from "@/lib/permissions";
import type { DateFilter, MatchedPerson, ResolvedIntent, UnresolvedPerson } from "@/lib/ai/resolve";
import { filterOwnedPeopleIds } from "@/lib/ai/safety";
import type { AskIntentKind } from "@/lib/ai/intent";
import { extractVisualQuery } from "@/lib/ai/intent";
import {
  buildEmptySearchReply,
  resolveEmptyReplyKind,
} from "@/lib/ai/empty-reply";
import { assessVisualLabelCoverage } from "@/lib/ai/visual-coverage";
import {
  buildVisualSearchTerms,
  scoreVisualMatch,
  suggestVisualAlternatives,
} from "@/lib/ai/visual-search";
import { suppressDismissedLabels } from "@/lib/media/tags";
import {
  detectMediaPreference,
  type MediaPreference,
} from "@/lib/ai/media-preference";
import {
  logPersonMediaResolution,
  resolveVisibleMediaIdsForPeople,
} from "@/lib/people/person-media";
import { logger } from "@/lib/observability/logger";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type MediaSort = "chronological" | "newest";

export type AssistantMediaQueryInput = {
  userId: string;
  /** Person IDs already resolved for this user (never invent). */
  peopleIds?: string[];
  /**
   * Display names for resolved people — used to scrub person-name visual hints
   * so "photos of Craig" is not AND-filtered as an object/scene search.
   */
  matchedPeopleNames?: string[];
  /**
   * `any` (default) = photo linked to at least one person.
   * `all` = photo must include every listed person (via faces).
   */
  peopleMatch?: "any" | "all";
  dateFilter?: DateFilter | null;
  /**
   * Optional free-text / visual hints (qualities, objects, scenes, visual_query).
   * Matched against AI visual metadata + filename.
   */
  textHints?: string[];
  /** Prefer ranking by visual relevance when hints are present. */
  visualQuery?: string | null;
  /**
   * Restrict to photos, videos, or both (default both).
   * Explicit "photos" / "videos" in the prompt maps to a hard type filter.
   */
  mediaPreference?: MediaPreference;
  limit?: number;
  offset?: number;
  /** Default chronological (oldest → newest) for slideshows / movies. */
  sort?: MediaSort;
  /** How many signed preview thumbnails to include (default 6). */
  sampleSize?: number;
  /** When false, skip R2 signing (tests / offline). Default true. */
  signPreviews?: boolean;
};

export type AssistantMediaItem = {
  id: string;
  type: Media["type"];
  contentType: string;
  originalFilename: string | null;
  /** Effective sort/filter timestamp (created_at until taken_at exists). */
  capturedAt: Date;
  createdAt: Date;
  thumbnailKey: string | null;
  hasThumbnail: boolean;
};

export type AssistantMediaThumbnail = {
  mediaId: string;
  previewUrl: string | null;
  hasThumbnail: boolean;
  capturedAt: Date;
  type: Media["type"];
};

export type MediaQueryDiagnostics = {
  matchedCount: number;
  /** Clean/ready media owned by the user (no people/date/text filters). */
  cleanReadyTotal: number;
  /** Clean/ready rows that already have visual labels (caption/tags/objects/scenes). */
  visualLabeledTotal: number;
  /** Clean/ready rows still missing visual analysis labels. */
  visualUnlabeledTotal: number;
  /**
   * Many clean photos but few ai_tags/ai_objects/ai_scenes — object/scene search
   * may return empty until analysis catches up. Never blocks the query.
   */
  lowVisualCoverage: boolean;
  /** labeled / cleanReady (0 when empty). */
  visualLabeledRatio: number;
  /** Clean/ready + people filter only (ignores date/text). */
  withPeopleOnly: number | null;
  /** Clean/ready + concrete date filter only (ignores people/text). */
  withDateOnly: number | null;
  /** Person IDs that have zero *visible* linked media for this user. */
  peopleWithoutFaces: Array<{ id: string; name: string | null }>;
  dateFilterApplied: boolean;
  dateFilterConcrete: boolean;
  dateLabel?: string;
  textHintsApplied: boolean;
  peopleMatch: "any" | "all";
  peopleIdCount: number;
  /** How the query was executed for logging / copy. */
  searchMode: "visual_labels" | "people" | "people_and_visual" | "browse";
  /** True when at least one linked result is family-shared (not owned). */
  sharedMediaIncluded?: boolean;
  /** Canonical person-media empty reasons (debug / sparse copy). */
  personMediaEmptyReasons?: string[];
};

export type AssistantMediaQueryResult = {
  items: AssistantMediaItem[];
  totalCount: number;
  sampleThumbnails: AssistantMediaThumbnail[];
  diagnostics: MediaQueryDiagnostics;
};

export type MediaQueryExplanation = {
  /** One-line assistant-facing summary. */
  summary: string;
  /** Concrete reasons results are sparse. */
  reasons: string[];
  /** Actionable next steps for the user. */
  suggestions: string[];
  empty: boolean;
  sparse: boolean;
  /** Object/scene search with thin visual label coverage. */
  lowVisualCoverage?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Query                                                                       */
/* -------------------------------------------------------------------------- */

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 200;
const DEFAULT_SAMPLE = 6;

/**
 * Query matching media for the assistant pipeline.
 */
export async function queryAssistantMedia(
  input: AssistantMediaQueryInput,
): Promise<AssistantMediaQueryResult> {
  const userId = input.userId;
  const requestedPeopleIds = uniqueIds(input.peopleIds ?? []);
  const peopleIds = await filterOwnedPeopleIds(userId, requestedPeopleIds);
  const peopleMatch = input.peopleMatch ?? "any";
  const dateFilter = input.dateFilter ?? null;
  const personNames = (input.matchedPeopleNames ?? []).map((n) => n.trim());
  const textHints = scrubPersonNameHints(cleanHints(input.textHints), personNames);
  const visualQueryScrubbed = scrubPersonNameHint(
    input.visualQuery?.trim() ?? "",
    personNames,
  );
  const primaryVisualTerms = cleanHints(
    [visualQueryScrubbed, ...textHints].filter((v): v is string => Boolean(v)),
  );
  const visualTerms = buildVisualSearchTerms(
    visualQueryScrubbed,
    ...textHints,
  );
  const searchHints =
    visualTerms.length > 0 ? visualTerms : textHints;
  // Person-primary: do not AND visual SQL/ranking against People-linked media.
  // Mixed people+visual keeps hard visual filters. Pure visual ignores people.
  const personPrimary =
    peopleIds.length > 0 && searchHints.length === 0;
  const hardVisualHints = personPrimary ? [] : searchHints;
  const searchMode = resolveSearchMode({
    peopleIds: requestedPeopleIds,
    textHints: hardVisualHints,
  });
  const mediaPreference = input.mediaPreference ?? "both";
  const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(input.offset ?? 0, 0);
  const sort = input.sort ?? "chronological";
  const sampleSize = clamp(input.sampleSize ?? DEFAULT_SAMPLE, 0, 24);
  const signPreviews = input.signPreviews !== false;

  const db = getDb();

  // Requested people that are not owned by this user must never widen the query.
  if (requestedPeopleIds.length > 0 && peopleIds.length === 0) {
    logger.info("ai.media_query", {
      reason: "people_ids_not_owned",
      userId,
      requestedPeopleIds,
    });
    const diagnostics = await buildDiagnostics({
      userId,
      matchedCount: 0,
      peopleIds: requestedPeopleIds,
      peopleMatch,
      dateFilter,
      textHints: hardVisualHints,
      peopleMediaIds: [],
      searchMode,
      sharedMediaIncluded: false,
      personMediaEmptyReasons: [
        "Requested people ids are not owned by the current user.",
      ],
    });
    return {
      items: [],
      totalCount: 0,
      sampleThumbnails: [],
      diagnostics,
    };
  }

  let peopleMediaIds: string[] | null = null;
  let sharedMediaIncluded = false;
  let personMediaEmptyReasons: string[] = [];
  let peopleWithoutVisibleMedia: Array<{ id: string; name: string | null }> =
    [];

  if (peopleIds.length > 0) {
    const resolvedPeopleMedia = await resolveVisibleMediaIdsForPeople(
      userId,
      peopleIds,
      peopleMatch,
    );
    logPersonMediaResolution({
      userId,
      source: "ai.media_query",
      peopleMatch,
      result: resolvedPeopleMedia,
    });
    peopleMediaIds = resolvedPeopleMedia.mediaIds;
    sharedMediaIncluded = resolvedPeopleMedia.sharedMediaIncluded;
    personMediaEmptyReasons = resolvedPeopleMedia.emptyReasons;
    peopleWithoutVisibleMedia = resolvedPeopleMedia.perPerson
      .filter((p) => p.linkedMediaCount === 0)
      .map((p) => ({ id: p.personId, name: p.personName }));
  }

  // People filter requested but no media linked → empty fast-path.
  // Skip this trap for pure visual searches (no people asked).
  if (peopleMediaIds && peopleMediaIds.length === 0) {
    const diagnostics = await buildDiagnostics({
      userId,
      matchedCount: 0,
      peopleIds,
      peopleMatch,
      dateFilter,
      textHints: hardVisualHints,
      peopleMediaIds,
      searchMode,
      sharedMediaIncluded,
      personMediaEmptyReasons,
      peopleWithoutVisibleMedia,
    });
    return {
      items: [],
      totalCount: 0,
      sampleThumbnails: [],
      diagnostics,
    };
  }

  const where = await buildWhereClause({
    userId,
    peopleMediaIds,
    dateFilter,
    textHints: hardVisualHints,
    mediaPreference,
  });

  const orderBy =
    sort === "newest" ? desc(media.createdAt) : asc(media.createdAt);

  // When ranking visually, over-fetch then score/sort in memory.
  const fetchLimit =
    hardVisualHints.length > 0
      ? Math.min(MAX_LIMIT, Math.max(limit * 4, 80))
      : limit;

  const [totalRow] = await db
    .select({ value: count() })
    .from(media)
    .where(where);

  let totalCount = Number(totalRow?.value ?? 0);

  const rows = await db
    .select({
      id: media.id,
      type: media.type,
      contentType: media.contentType,
      originalFilename: media.originalFilename,
      createdAt: media.createdAt,
      thumbnailKey: media.thumbnailKey,
      processedKey: media.processedKey,
      originalKey: media.originalKey,
      moderationStatus: media.moderationStatus,
      status: media.status,
      userId: media.userId,
      sceneCaption: media.sceneCaption,
      sceneTags: media.sceneTags,
      aiCaption: media.aiCaption,
      aiTags: media.aiTags,
      userTags: media.userTags,
      aiObjects: media.aiObjects,
      aiScenes: media.aiScenes,
      aiDescription: media.aiDescription,
      dismissedAiTags: media.dismissedAiTags,
    })
    .from(media)
    .where(where)
    .orderBy(orderBy)
    .limit(fetchLimit)
    .offset(hardVisualHints.length > 0 ? 0 : offset);

  let ranked = rows;
  if (hardVisualHints.length > 0) {
    const scored = [...rows]
      .map((row) => {
        const dismissed = row.dismissedAiTags ?? [];
        const aiTags = suppressDismissedLabels(row.aiTags, dismissed);
        const sceneTags = suppressDismissedLabels(row.sceneTags, dismissed);
        const objects = suppressDismissedLabels(row.aiObjects, dismissed);
        const scenes = suppressDismissedLabels(row.aiScenes, dismissed);
        return {
          row,
          score: scoreVisualMatch(
            hardVisualHints,
            {
              caption: row.aiCaption || row.sceneCaption,
              description: row.aiDescription,
              tags: [...aiTags, ...sceneTags],
              userTags: row.userTags,
              objects,
              scenes,
              filename: row.originalFilename,
            },
            { primaryTerms: primaryVisualTerms },
          ),
        };
      })
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.createdAt.getTime() - a.row.createdAt.getTime(),
      );

    // Prefer scored relevance; fall back to SQL order if nothing scored.
    if (scored.length > 0) {
      totalCount = scored.length;
      ranked = scored.map((entry) => entry.row).slice(offset, offset + limit);
    } else {
      ranked = rows.slice(offset, offset + limit);
    }
  }

  const items: AssistantMediaItem[] = ranked.map((row) => ({
    id: row.id,
    type: row.type,
    contentType: row.contentType,
    originalFilename: row.originalFilename,
    capturedAt: row.createdAt,
    createdAt: row.createdAt,
    thumbnailKey: row.thumbnailKey,
    hasThumbnail: Boolean(row.thumbnailKey),
  }));

  const sampleRows = ranked.slice(0, sampleSize);
  const sampleThumbnails: AssistantMediaThumbnail[] = [];

  if (signPreviews && sampleRows.length > 0) {
    const signed = await Promise.all(
      sampleRows.map(async (row) => {
        const safe = await toSafeMediaItem(row);
        return {
          mediaId: row.id,
          previewUrl: safe?.previewUrl ?? null,
          hasThumbnail: Boolean(row.thumbnailKey),
          capturedAt: row.createdAt,
          type: row.type,
        } satisfies AssistantMediaThumbnail;
      }),
    );
    sampleThumbnails.push(...signed);
  } else {
    for (const row of sampleRows) {
      sampleThumbnails.push({
        mediaId: row.id,
        previewUrl: null,
        hasThumbnail: Boolean(row.thumbnailKey),
        capturedAt: row.createdAt,
        type: row.type,
      });
    }
  }

  if (!sharedMediaIncluded && ranked.some((row) => row.userId !== userId)) {
    sharedMediaIncluded = true;
  }

  const diagnostics = await buildDiagnostics({
    userId,
    matchedCount: totalCount,
    peopleIds,
    peopleMatch,
    dateFilter,
    textHints: hardVisualHints,
    peopleMediaIds,
    searchMode,
    sharedMediaIncluded,
    personMediaEmptyReasons,
    peopleWithoutVisibleMedia,
  });

  logger.info("ai.media_query", {
    userId,
    searchMode,
    peopleIds,
    matchedCount: totalCount,
    linkedMediaCount: peopleMediaIds?.length ?? null,
    sharedMediaIncluded,
    hardVisualHints,
    personMediaEmptyReasons,
  });

  return {
    items,
    totalCount,
    sampleThumbnails,
    diagnostics,
  };
}

/**
 * Convenience: query from a ResolvedIntent payload.
 */
export async function queryMediaForResolvedIntent(
  userId: string,
  resolved: ResolvedIntent,
  options?: Omit<
    AssistantMediaQueryInput,
    | "userId"
    | "peopleIds"
    | "dateFilter"
    | "textHints"
    | "visualQuery"
    | "matchedPeopleNames"
  > & {
    textHints?: string[];
  },
): Promise<AssistantMediaQueryResult> {
  const intent = resolved.intent;
  const matchedPeopleNames = resolved.matchedPeople.map((p) => p.name);
  // Prefer explicit visual fields, but also keep original-language nouns from
  // the raw prompt so multilingual queries still match English AI tags after
  // synonym expansion (and any multilingual user tags / captions).
  const promptVisual = extractVisualQuery(intent.raw_prompt);
  const rawHints = [
    ...(options?.textHints ?? []),
    ...(intent.qualities ?? []),
    ...(intent.objects ?? []),
    ...(intent.scenes ?? []),
    ...(promptVisual ? [promptVisual] : []),
  ];
  const hints = scrubPersonNameHints(rawHints, matchedPeopleNames);
  const visualQueryRaw =
    intent.visual_query?.trim() ||
    [...(intent.objects ?? []), ...(intent.scenes ?? []), ...(intent.qualities ?? [])]
      .join(" ")
      .trim() ||
    promptVisual ||
    null;
  const visualQuery = scrubPersonNameHint(visualQueryRaw ?? "", matchedPeopleNames) || null;

  const mediaPreference =
    options?.mediaPreference ??
    intent.media_preference ??
    detectMediaPreference(intent.raw_prompt);

  return queryAssistantMedia({
    userId,
    peopleIds: resolved.peopleIds,
    matchedPeopleNames,
    dateFilter: resolved.dateFilter,
    ...options,
    textHints: hints.length ? hints : undefined,
    visualQuery,
    mediaPreference,
  });
}

/**
 * Load specific clean/ready media IDs the user can access
 * (own + family-shared) — e.g. turn a search into a memory.
 * Preserves requested order; drops IDs that are missing or not safe to serve.
 */
export async function loadAssistantMediaByIds(
  userId: string,
  mediaIds: string[],
  options?: { sampleSize?: number; signPreviews?: boolean; limit?: number },
): Promise<AssistantMediaQueryResult> {
  const unique = uniqueIds(mediaIds).slice(
    0,
    clamp(options?.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT),
  );
  const sampleSize = clamp(options?.sampleSize ?? DEFAULT_SAMPLE, 0, 24);
  const signPreviews = options?.signPreviews !== false;

  if (unique.length === 0) {
    return {
      items: [],
      totalCount: 0,
      sampleThumbnails: [],
      diagnostics: await buildDiagnostics({
        userId,
        matchedCount: 0,
        peopleIds: [],
        peopleMatch: "any",
        dateFilter: null,
        textHints: [],
        peopleMediaIds: null,
      }),
    };
  }

  const rows = await loadCleanAccessibleMediaByIds(userId, unique);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = unique
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const items: AssistantMediaItem[] = ordered.map((row) => ({
    id: row.id,
    type: row.type,
    contentType: row.contentType,
    originalFilename: row.originalFilename,
    capturedAt: row.createdAt,
    createdAt: row.createdAt,
    thumbnailKey: row.thumbnailKey,
    hasThumbnail: Boolean(row.thumbnailKey),
  }));

  const sampleRows = ordered.slice(0, sampleSize);
  const sampleThumbnails: AssistantMediaThumbnail[] = [];

  if (signPreviews && sampleRows.length > 0) {
    const signed = await Promise.all(
      sampleRows.map(async (row) => {
        const safe = await toSafeMediaItem(row);
        return {
          mediaId: row.id,
          previewUrl: safe?.previewUrl ?? null,
          hasThumbnail: Boolean(row.thumbnailKey),
          capturedAt: row.createdAt,
          type: row.type,
        } satisfies AssistantMediaThumbnail;
      }),
    );
    sampleThumbnails.push(...signed);
  } else {
    for (const row of sampleRows) {
      sampleThumbnails.push({
        mediaId: row.id,
        previewUrl: null,
        hasThumbnail: Boolean(row.thumbnailKey),
        capturedAt: row.createdAt,
        type: row.type,
      });
    }
  }

  return {
    items,
    totalCount: items.length,
    sampleThumbnails,
    diagnostics: await buildDiagnostics({
      userId,
      matchedCount: items.length,
      peopleIds: [],
      peopleMatch: "any",
      dateFilter: null,
      textHints: [],
      peopleMediaIds: null,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Explanation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Explain why few or no media matched so the assistant can reply helpfully.
 *
 * Pass `matchedPeople` when available for friendlier person names.
 * Pass `intentKind` so object/scene empty replies never use People fallbacks.
 */
export function explainSparseMediaResults(input: {
  diagnostics: MediaQueryDiagnostics;
  matchedPeople?: MatchedPerson[];
  /** Treat below this count as "sparse" (default 3). */
  sparseThreshold?: number;
  /** Original visual query for alternative suggestions. */
  visualQuery?: string | null;
  objects?: string[];
  scenes?: string[];
  /** Ask AI routing — drives empty copy. */
  intentKind?: AskIntentKind;
  unresolvedPeople?: UnresolvedPerson[];
  peopleNames?: string[];
  /** Force admin/dev enqueue hint in object/scene empty replies. */
  includeAdminHint?: boolean;
}): MediaQueryExplanation {
  const { diagnostics } = input;
  const threshold = input.sparseThreshold ?? 3;
  const empty = diagnostics.matchedCount === 0;
  const sparse = !empty && diagnostics.matchedCount < threshold;
  const reasons: string[] = [];
  const suggestions: string[] = [];

  const emptyKind = resolveEmptyReplyKind(input.intentKind);
  const isObjectSceneEmpty = empty && emptyKind === "object_scene";
  const isPersonEmpty = empty && emptyKind === "person";

  // Intent-first empty replies (object/scene never use People fallback).
  if (isObjectSceneEmpty) {
    const coverage = assessVisualLabelCoverage({
      cleanReadyTotal: diagnostics.cleanReadyTotal,
      visualLabeledTotal: diagnostics.visualLabeledTotal,
      visualUnlabeledTotal: diagnostics.visualUnlabeledTotal,
    });
    const unlabeledRatio =
      diagnostics.cleanReadyTotal > 0
        ? diagnostics.visualUnlabeledTotal / diagnostics.cleanReadyTotal
        : 0;
    const labelsStillProcessing =
      diagnostics.lowVisualCoverage ||
      coverage.lowCoverage ||
      (diagnostics.cleanReadyTotal > 0 &&
        (diagnostics.visualLabeledTotal === 0 || unlabeledRatio >= 0.5));

    if (diagnostics.cleanReadyTotal === 0) {
      reasons.push("Your library has no clean, ready photos or videos yet.");
    } else if (coverage.lowCoverage && coverage.coverageNote) {
      reasons.push(coverage.coverageNote);
    }

    const reply = buildEmptySearchReply({
      intentKind: input.intentKind,
      visualQuery: input.visualQuery,
      objects: input.objects,
      scenes: input.scenes,
      labelsStillProcessing,
      coverage,
      cleanReadyTotal: diagnostics.cleanReadyTotal,
      visualLabeledTotal: diagnostics.visualLabeledTotal,
      visualUnlabeledTotal: diagnostics.visualUnlabeledTotal,
      includeAdminHint: input.includeAdminHint,
    });
    return {
      summary: reply.summary,
      reasons: uniqueStrings(reasons),
      suggestions: uniqueStrings(reply.suggestions),
      empty,
      sparse,
      lowVisualCoverage: Boolean(
        reply.lowVisualCoverage || coverage.lowCoverage,
      ),
    };
  }

  if (isPersonEmpty) {
    const reply = buildEmptySearchReply({
      intentKind: input.intentKind,
      matchedPeople: input.matchedPeople,
      unresolvedPeople: input.unresolvedPeople,
      peopleNames: input.peopleNames,
      hasCatalogMatch: (input.matchedPeople?.length ?? 0) > 0,
    });
    // Keep concrete face/date diagnostics as extra reasons when useful.
    if (diagnostics.cleanReadyTotal === 0) {
      reasons.push("Your library has no clean, ready photos or videos yet.");
    } else if (diagnostics.peopleWithoutFaces.length > 0) {
      reasons.push(
        "No tagged faces were found for this person yet, so photo matching may be limited.",
      );
    } else if ((diagnostics.personMediaEmptyReasons?.length ?? 0) > 0) {
      reasons.push(...(diagnostics.personMediaEmptyReasons ?? []).slice(0, 2));
    }
    return {
      summary: reply.summary,
      reasons: uniqueStrings(reasons),
      suggestions: uniqueStrings(reply.suggestions),
      empty,
      sparse,
    };
  }

  const personNames = nameLookup(input.matchedPeople);
  const peopleLabel = formatPeopleLabel(
    diagnostics.peopleIdCount,
    diagnostics.peopleWithoutFaces,
    personNames,
  );

  if (diagnostics.cleanReadyTotal === 0) {
    reasons.push("Your library has no clean, ready photos or videos yet.");
    suggestions.push(
      "Upload media and wait until moderation finishes, then try again.",
    );
  }

  // Never attach People-list miss copy when the ask was visual-only.
  if (diagnostics.peopleIdCount > 0 && emptyKind !== "object_scene") {
    if (diagnostics.peopleWithoutFaces.length > 0) {
      const names = diagnostics.peopleWithoutFaces
        .map((p) => p.name ?? personNames.get(p.id) ?? "that person")
        .join(", ");
      reasons.push(
        `No tagged faces were found for ${names}, so people filtering cannot match media yet.`,
      );
      suggestions.push(
        "Check People for the right card, or manually assign faces from People or the media viewer.",
      );
    }

    if (
      diagnostics.withPeopleOnly === 0 &&
      diagnostics.peopleWithoutFaces.length === 0
    ) {
      reasons.push(
        diagnostics.peopleMatch === "all"
          ? `No photos or videos include all of ${peopleLabel} together.`
          : `No clean photos or videos are linked to ${peopleLabel}.`,
      );
      suggestions.push(
        "Check People for the right spelling or nickname, or manually assign faces to that person.",
      );
    } else if (
      diagnostics.withPeopleOnly !== null &&
      diagnostics.withPeopleOnly > 0 &&
      diagnostics.matchedCount === 0 &&
      diagnostics.dateFilterConcrete
    ) {
      reasons.push(
        `Found ${diagnostics.withPeopleOnly} item(s) of ${peopleLabel}, but none fall in ${diagnostics.dateLabel ?? "that date range"}.`,
      );
      suggestions.push(
        "Widen the date range, or drop the time filter and browse all media of that person.",
      );
    }
  }

  if (diagnostics.dateFilterApplied && !diagnostics.dateFilterConcrete) {
    reasons.push(
      `The time reference “${diagnostics.dateLabel ?? "that period"}” is not concrete enough to filter by yet.`,
    );
    suggestions.push(
      "Specify a year (for example 2022) or an exact range like Christmas 2024.",
    );
  }

  if (
    diagnostics.dateFilterConcrete &&
    diagnostics.withDateOnly === 0 &&
    diagnostics.cleanReadyTotal > 0
  ) {
    reasons.push(
      `No clean media was uploaded in ${diagnostics.dateLabel ?? "that date range"} (using upload/created time).`,
    );
    suggestions.push(
      "Try a broader year, or note that filters currently use upload date until capture dates are stored.",
    );
  }

  if (diagnostics.textHintsApplied && diagnostics.matchedCount === 0) {
    const visualLabel = input.visualQuery?.trim();
    const unlabeledRatio =
      diagnostics.cleanReadyTotal > 0
        ? diagnostics.visualUnlabeledTotal / diagnostics.cleanReadyTotal
        : 0;
    const labelsSparse =
      diagnostics.visualLabeledTotal === 0 || unlabeledRatio >= 0.5;

    // Prefer object/scene empty copy whenever a visual label is present and
    // we are not in an explicit person search.
    if (emptyKind !== "person") {
      const reply = buildEmptySearchReply({
        intentKind: input.intentKind ?? "object_search",
        visualQuery: input.visualQuery,
        objects: input.objects,
        scenes: input.scenes,
        labelsStillProcessing: labelsSparse && diagnostics.cleanReadyTotal > 0,
      });
      return {
        summary: reply.summary,
        reasons: uniqueStrings(reasons),
        suggestions: uniqueStrings([...suggestions, ...reply.suggestions]),
        empty,
        sparse,
      };
    }

    if (labelsSparse && diagnostics.cleanReadyTotal > 0) {
      reasons.push(
        visualLabel
          ? `I couldn't find photos of ${visualLabel} yet — visual analysis may still be processing on many of your uploads.`
          : "Visual labels look sparse in your library — analysis may still be processing.",
      );
      suggestions.push(
        "Wait for scene/object indexing to finish on recent uploads, then try again.",
      );
    } else {
      reasons.push(
        visualLabel
          ? `I couldn't find photos of ${visualLabel} yet.`
          : "No photos or videos matched those visual terms in captions, AI tags, manual tags, objects, or scenes yet.",
      );
    }
    if (visualLabel) {
      suggestions.push(...suggestVisualAlternatives(visualLabel));
    } else {
      suggestions.push(
        "try a simpler object word (cake, beach, dog, toilet, bicycle)",
        "try a scene word (indoors, beach, kitchen, bathroom, party)",
      );
    }
    if (!labelsSparse) {
      suggestions.push(
        "If these were uploaded recently, wait for visual analysis to finish, then try again.",
      );
    }
  }

  if (empty && reasons.length === 0) {
    reasons.push("No photos or videos matched the current filters.");
    suggestions.push("Try fewer filters — for example just a person, or just a year.");
  }

  if (sparse && reasons.length === 0) {
    reasons.push(
      `Only ${diagnostics.matchedCount} item(s) matched — that may be too few for a good slideshow.`,
    );
    suggestions.push("Widen the date range or include additional people.");
  }

  let summary: string;
  if (empty) {
    summary = reasons[0] ?? "I couldn’t find matching photos or videos.";
  } else if (sparse) {
    summary = input.visualQuery?.trim()
      ? `I only found ${diagnostics.matchedCount} item(s) related to ${input.visualQuery.trim()}.`
      : `I only found ${diagnostics.matchedCount} matching item(s).`;
  } else {
    summary = input.visualQuery?.trim()
      ? `Found ${diagnostics.matchedCount} item(s) related to ${input.visualQuery.trim()}.`
      : `Found ${diagnostics.matchedCount} matching item(s).`;
  }

  return {
    summary,
    reasons: uniqueStrings(reasons),
    suggestions: uniqueStrings(suggestions),
    empty,
    sparse,
  };
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

/** Drop visual hints that are just resolved person names (People path, not tags). */
export function scrubPersonNameHints(
  hints: string[],
  personNames: string[],
): string[] {
  if (hints.length === 0 || personNames.length === 0) return hints;
  return hints
    .map((hint) => scrubPersonNameHint(hint, personNames))
    .filter((hint): hint is string => Boolean(hint));
}

export function scrubPersonNameHint(
  hint: string,
  personNames: string[],
): string {
  const trimmed = hint.trim();
  if (!trimmed) return "";
  if (personNames.length === 0) return trimmed;

  const lower = trimmed.toLowerCase();
  const nameTokens = new Set<string>();
  for (const name of personNames) {
    const n = name.trim().toLowerCase();
    if (!n) continue;
    nameTokens.add(n);
    for (const part of n.split(/\s+/)) {
      if (part.length > 2) nameTokens.add(part);
    }
  }

  // Exact person / first-name only hints → drop (People path owns these).
  if (nameTokens.has(lower)) return "";

  let next = trimmed;
  for (const name of personNames) {
    const n = name.trim();
    if (!n) continue;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ");
    for (const part of n.split(/\s+/)) {
      if (part.length <= 2) continue;
      const partEsc = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      next = next.replace(new RegExp(`\\b${partEsc}\\b`, "ig"), " ");
    }
  }

  next = next
    .replace(
      /\b(?:photos?|pictures?|pics?|images?|videos?|of|with|showing)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return next;
}

async function buildWhereClause(input: {
  userId: string;
  peopleMediaIds: string[] | null;
  dateFilter: DateFilter | null;
  textHints: string[];
  mediaPreference?: MediaPreference;
}): Promise<SQL> {
  const accessFilter = await getAccessibleMediaFilter(input.userId);
  const parts: SQL[] = [accessFilter];

  if (input.mediaPreference === "photos") {
    parts.push(eq(media.type, "photo"));
  } else if (input.mediaPreference === "videos") {
    parts.push(eq(media.type, "video"));
  }

  if (input.peopleMediaIds) {
    parts.push(inArray(media.id, input.peopleMediaIds));
  }

  const dateSql = dateFilterSql(input.dateFilter);
  if (dateSql) parts.push(dateSql);

  const hintSql = textHintsSql(input.textHints);
  if (hintSql) parts.push(hintSql);

  return and(...parts)!;
}

/**
 * Date filter against created_at (stand-in for taken_at).
 * End date is inclusive through end-of-day UTC.
 */
export function dateFilterSql(dateFilter: DateFilter | null | undefined): SQL | null {
  if (!dateFilter?.isConcrete || !dateFilter.start || !dateFilter.end) {
    return null;
  }
  const start = startOfUtcDay(dateFilter.start);
  const end = endOfUtcDay(dateFilter.end);
  if (!start || !end) return null;
  return and(gte(media.createdAt, start), lte(media.createdAt, end))!;
}

function textHintsSql(hints: string[]): SQL | null {
  if (hints.length === 0) return null;
  const clauses: SQL[] = [];
  for (const hint of hints.slice(0, 16)) {
    const pattern = `%${escapeLike(hint)}%`;
    clauses.push(ilike(media.originalFilename, pattern));
    clauses.push(ilike(media.sceneCaption, pattern));
    clauses.push(ilike(media.aiCaption, pattern));
    clauses.push(ilike(media.aiDescription, pattern));
    // jsonb arrays — AI labels + manual user tags (first-class recall)
    clauses.push(sql`${media.sceneTags}::text ilike ${pattern}`);
    clauses.push(sql`${media.aiTags}::text ilike ${pattern}`);
    clauses.push(sql`${media.userTags}::text ilike ${pattern}`);
    clauses.push(sql`${media.aiObjects}::text ilike ${pattern}`);
    clauses.push(sql`${media.aiScenes}::text ilike ${pattern}`);
  }
  if (clauses.length === 0) return null;
  return or(...clauses)!;
}

async function buildDiagnostics(input: {
  userId: string;
  matchedCount: number;
  peopleIds: string[];
  peopleMatch: "any" | "all";
  dateFilter: DateFilter | null;
  textHints: string[];
  peopleMediaIds: string[] | null;
  searchMode?: MediaQueryDiagnostics["searchMode"];
  sharedMediaIncluded?: boolean;
  personMediaEmptyReasons?: string[];
  /** Prefer canonical visible-linked emptiness over raw face row counts. */
  peopleWithoutVisibleMedia?: Array<{ id: string; name: string | null }>;
}): Promise<MediaQueryDiagnostics> {
  const db = getDb();
  const accessFilter = await getAccessibleMediaFilter(input.userId);

  const [cleanRow] = await db
    .select({ value: count() })
    .from(media)
    .where(accessFilter);
  const cleanReadyTotal = Number(cleanRow?.value ?? 0);

  const [labeledRow] = await db
    .select({ value: count() })
    .from(media)
    .where(
      and(
        accessFilter,
        or(
          isNotNull(media.visualAnalyzedAt),
          isNotNull(media.aiCaption),
          isNotNull(media.sceneCaption),
          sql`coalesce(jsonb_array_length(${media.aiTags}), 0) > 0`,
          sql`coalesce(jsonb_array_length(${media.aiObjects}), 0) > 0`,
          sql`coalesce(jsonb_array_length(${media.aiScenes}), 0) > 0`,
          sql`coalesce(jsonb_array_length(${media.sceneTags}), 0) > 0`,
        ),
      ),
    );
  const visualLabeledTotal = Number(labeledRow?.value ?? 0);
  const visualUnlabeledTotal = Math.max(0, cleanReadyTotal - visualLabeledTotal);
  const coverage = assessVisualLabelCoverage({
    cleanReadyTotal,
    visualLabeledTotal,
    visualUnlabeledTotal,
  });

  let withPeopleOnly: number | null = null;
  if (input.peopleIds.length > 0) {
    if (input.peopleMediaIds) {
      if (input.peopleMediaIds.length === 0) {
        withPeopleOnly = 0;
      } else {
        const [row] = await db
          .select({ value: count() })
          .from(media)
          .where(
            and(
              accessFilter,
              inArray(media.id, input.peopleMediaIds),
            ),
          );
        withPeopleOnly = Number(row?.value ?? 0);
      }
    }
  }

  let withDateOnly: number | null = null;
  const dateSql = dateFilterSql(input.dateFilter);
  if (dateSql) {
    const [row] = await db
      .select({ value: count() })
      .from(media)
      .where(and(accessFilter, dateSql));
    withDateOnly = Number(row?.value ?? 0);
  }

  let peopleWithoutFaces: Array<{ id: string; name: string | null }> =
    input.peopleWithoutVisibleMedia ?? [];

  if (!input.peopleWithoutVisibleMedia && input.peopleIds.length > 0) {
    // Fallback: people with zero visible linked media (canonical helper).
    const visible = await resolveVisibleMediaIdsForPeople(
      input.userId,
      input.peopleIds,
      input.peopleMatch,
    );
    peopleWithoutFaces = visible.perPerson
      .filter((p) => p.linkedMediaCount === 0)
      .map((p) => ({ id: p.personId, name: p.personName }));
  }

  return {
    matchedCount: input.matchedCount,
    cleanReadyTotal,
    visualLabeledTotal,
    visualUnlabeledTotal,
    lowVisualCoverage: coverage.lowCoverage,
    visualLabeledRatio: coverage.labeledRatio,
    withPeopleOnly,
    withDateOnly,
    peopleWithoutFaces,
    dateFilterApplied: Boolean(input.dateFilter),
    dateFilterConcrete: Boolean(input.dateFilter?.isConcrete),
    dateLabel: input.dateFilter?.label,
    textHintsApplied: input.textHints.length > 0,
    peopleMatch: input.peopleMatch,
    peopleIdCount: input.peopleIds.length,
    searchMode:
      input.searchMode ??
      resolveSearchMode({
        peopleIds: input.peopleIds,
        textHints: input.textHints,
      }),
    sharedMediaIncluded: input.sharedMediaIncluded ?? false,
    personMediaEmptyReasons: input.personMediaEmptyReasons ?? [],
  };
}

function resolveSearchMode(input: {
  peopleIds: string[];
  textHints: string[];
}): MediaQueryDiagnostics["searchMode"] {
  const hasPeople = input.peopleIds.length > 0;
  const hasVisual = input.textHints.length > 0;
  if (hasPeople && hasVisual) return "people_and_visual";
  if (hasPeople) return "people";
  if (hasVisual) return "visual_labels";
  return "browse";
}

export function startOfUtcDay(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function endOfUtcDay(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanHints(hints: string[] | undefined): string[] {
  if (!hints?.length) return [];
  const out: string[] = [];
  for (const hint of hints) {
    const trimmed = hint.trim();
    if (trimmed.length < 2) continue;
    if (!out.some((h) => h.toLowerCase() === trimmed.toLowerCase())) {
      out.push(trimmed);
    }
  }
  return out.slice(0, 8);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!out.some((item) => item.toLowerCase() === value.toLowerCase())) {
      out.push(value);
    }
  }
  return out;
}

function nameLookup(
  matchedPeople: MatchedPerson[] | undefined,
): Map<string, string> {
  return new Map((matchedPeople ?? []).map((p) => [p.id, p.name]));
}

function formatPeopleLabel(
  peopleIdCount: number,
  withoutFaces: Array<{ id: string; name: string | null }>,
  names: Map<string, string>,
): string {
  if (peopleIdCount === 0) return "the selected people";
  if (withoutFaces.length === 1 && withoutFaces[0]?.name) {
    return withoutFaces[0].name;
  }
  const known = [...names.values()];
  if (known.length === 1) return known[0]!;
  if (known.length > 1) return known.join(" / ");
  return peopleIdCount === 1 ? "that person" : "those people";
}
