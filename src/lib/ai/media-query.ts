/**
 * Assistant media selection — query clean/ready media for the current user
 * using resolved people IDs and date filters.
 *
 * Safety:
 * - Always scopes to `userId` via `cleanReadyMediaFilter` (own library only).
 * - Requires moderation_status=clean AND status=ready.
 * - People filters use faces owned by the same userId.
 * - Family co-member gallery media is intentionally excluded from creates;
 *   search uses the same own-only gate so assistant never leaks another vault.
 * - `textHints` / visual fields match filename + AI visual metadata
 *   (ai_caption/tags/objects/scenes/description and legacy scene_*).
 */

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, media, people, type Media } from "@/lib/db/schema";
import {
  cleanReadyMediaFilter,
  toSafeMediaItem,
  type SafeMediaItem,
} from "@/lib/media/queries";
import type { DateFilter, MatchedPerson, ResolvedIntent } from "@/lib/ai/resolve";
import { filterOwnedPeopleIds } from "@/lib/ai/safety";
import {
  expandVisualQueryTerms,
  scoreVisualMatch,
  suggestVisualAlternatives,
} from "@/lib/ai/visual-search";
import {
  detectMediaPreference,
  type MediaPreference,
} from "@/lib/ai/media-preference";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type MediaSort = "chronological" | "newest";

export type AssistantMediaQueryInput = {
  userId: string;
  /** Person IDs already resolved for this user (never invent). */
  peopleIds?: string[];
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
  /** Clean/ready + people filter only (ignores date/text). */
  withPeopleOnly: number | null;
  /** Clean/ready + concrete date filter only (ignores people/text). */
  withDateOnly: number | null;
  /** Person IDs that have zero face links for this user. */
  peopleWithoutFaces: Array<{ id: string; name: string | null }>;
  dateFilterApplied: boolean;
  dateFilterConcrete: boolean;
  dateLabel?: string;
  textHintsApplied: boolean;
  peopleMatch: "any" | "all";
  peopleIdCount: number;
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
  const textHints = cleanHints(input.textHints);
  const visualTerms = expandVisualQueryTerms(
    [input.visualQuery, ...textHints].filter(Boolean).join(" "),
  );
  const searchHints =
    visualTerms.length > 0 ? visualTerms : textHints;
  const mediaPreference = input.mediaPreference ?? "both";
  const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(input.offset ?? 0, 0);
  const sort = input.sort ?? "chronological";
  const sampleSize = clamp(input.sampleSize ?? DEFAULT_SAMPLE, 0, 24);
  const signPreviews = input.signPreviews !== false;

  const db = getDb();

  // Requested people that are not owned by this user must never widen the query.
  if (requestedPeopleIds.length > 0 && peopleIds.length === 0) {
    const diagnostics = await buildDiagnostics({
      userId,
      matchedCount: 0,
      peopleIds: requestedPeopleIds,
      peopleMatch,
      dateFilter,
      textHints: searchHints,
      peopleMediaIds: [],
    });
    return {
      items: [],
      totalCount: 0,
      sampleThumbnails: [],
      diagnostics,
    };
  }

  const peopleMediaIds = peopleIds.length
    ? await resolveMediaIdsForPeople(userId, peopleIds, peopleMatch)
    : null;

  // People filter requested but no media linked → empty fast-path.
  if (peopleMediaIds && peopleMediaIds.length === 0) {
    const diagnostics = await buildDiagnostics({
      userId,
      matchedCount: 0,
      peopleIds,
      peopleMatch,
      dateFilter,
      textHints: searchHints,
      peopleMediaIds,
    });
    return {
      items: [],
      totalCount: 0,
      sampleThumbnails: [],
      diagnostics,
    };
  }

  const where = buildWhereClause({
    userId,
    peopleMediaIds,
    dateFilter,
    textHints: searchHints,
    mediaPreference,
  });

  const orderBy =
    sort === "newest" ? desc(media.createdAt) : asc(media.createdAt);

  // When ranking visually, over-fetch then score/sort in memory.
  const fetchLimit =
    searchHints.length > 0
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
      aiObjects: media.aiObjects,
      aiScenes: media.aiScenes,
      aiDescription: media.aiDescription,
    })
    .from(media)
    .where(where)
    .orderBy(orderBy)
    .limit(fetchLimit)
    .offset(searchHints.length > 0 ? 0 : offset);

  let ranked = rows;
  if (searchHints.length > 0) {
    const scored = [...rows]
      .map((row) => ({
        row,
        score: scoreVisualMatch(searchHints, {
          caption: row.aiCaption || row.sceneCaption,
          description: row.aiDescription,
          tags: [...(row.aiTags ?? []), ...(row.sceneTags ?? [])],
          objects: row.aiObjects,
          scenes: row.aiScenes,
          filename: row.originalFilename,
        }),
      }))
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

  const diagnostics = await buildDiagnostics({
    userId,
    matchedCount: totalCount,
    peopleIds,
    peopleMatch,
    dateFilter,
    textHints: searchHints,
    peopleMediaIds,
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
    "userId" | "peopleIds" | "dateFilter" | "textHints" | "visualQuery"
  > & {
    textHints?: string[];
  },
): Promise<AssistantMediaQueryResult> {
  const intent = resolved.intent;
  const hints = [
    ...(options?.textHints ?? []),
    ...(intent.qualities ?? []),
    ...(intent.objects ?? []),
    ...(intent.scenes ?? []),
  ];
  const visualQuery =
    intent.visual_query?.trim() ||
    [...(intent.objects ?? []), ...(intent.scenes ?? []), ...(intent.qualities ?? [])]
      .join(" ")
      .trim() ||
    null;

  const mediaPreference =
    options?.mediaPreference ??
    intent.media_preference ??
    detectMediaPreference(intent.raw_prompt);

  return queryAssistantMedia({
    userId,
    peopleIds: resolved.peopleIds,
    dateFilter: resolved.dateFilter,
    ...options,
    textHints: hints.length ? hints : undefined,
    visualQuery,
    mediaPreference,
  });
}

/**
 * Load specific clean/ready media IDs for the user (e.g. turn a search into a memory).
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

  const db = getDb();
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
    })
    .from(media)
    .where(
      and(
        cleanReadyMediaFilter(userId),
        inArray(media.id, unique),
      ),
    );

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
 */
export function explainSparseMediaResults(input: {
  diagnostics: MediaQueryDiagnostics;
  matchedPeople?: MatchedPerson[];
  /** Treat below this count as "sparse" (default 3). */
  sparseThreshold?: number;
  /** Original visual query for alternative suggestions. */
  visualQuery?: string | null;
}): MediaQueryExplanation {
  const { diagnostics } = input;
  const threshold = input.sparseThreshold ?? 3;
  const empty = diagnostics.matchedCount === 0;
  const sparse = !empty && diagnostics.matchedCount < threshold;
  const reasons: string[] = [];
  const suggestions: string[] = [];

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

  if (diagnostics.peopleIdCount > 0) {
    if (diagnostics.peopleWithoutFaces.length > 0) {
      const names = diagnostics.peopleWithoutFaces
        .map((p) => p.name ?? personNames.get(p.id) ?? "that person")
        .join(", ");
      reasons.push(
        `No tagged faces were found for ${names}, so people filtering cannot match media yet.`,
      );
      suggestions.push(
        "Open People and confirm faces are labeled, or run face detection on recent uploads.",
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
        "Try a different person, or clear the people filter and search by date only.",
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
    reasons.push(
      "No photos or videos matched those visual terms in captions, tags, objects, or scenes yet.",
    );
    if (input.visualQuery?.trim()) {
      suggestions.push(...suggestVisualAlternatives(input.visualQuery));
    } else {
      suggestions.push(
        "try a simpler object word (cake, beach, dog, bicycle)",
        "try a scene word (playground, party, wedding, pool)",
      );
    }
    suggestions.push(
      "If these were uploaded recently, wait for visual analysis to finish, then try again.",
    );
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

async function resolveMediaIdsForPeople(
  userId: string,
  peopleIds: string[],
  peopleMatch: "any" | "all",
): Promise<string[]> {
  const db = getDb();

  if (peopleMatch === "all" && peopleIds.length > 1) {
    const rows = await db
      .select({
        mediaId: faces.mediaId,
        personCount: countDistinct(faces.personId),
      })
      .from(faces)
      .where(
        and(eq(faces.userId, userId), inArray(faces.personId, peopleIds)),
      )
      .groupBy(faces.mediaId)
      .having(sql`count(distinct ${faces.personId}) = ${peopleIds.length}`);

    return rows.map((row) => row.mediaId);
  }

  const rows = await db
    .selectDistinct({ mediaId: faces.mediaId })
    .from(faces)
    .where(and(eq(faces.userId, userId), inArray(faces.personId, peopleIds)));

  return rows.map((row) => row.mediaId);
}

function buildWhereClause(input: {
  userId: string;
  peopleMediaIds: string[] | null;
  dateFilter: DateFilter | null;
  textHints: string[];
  mediaPreference?: MediaPreference;
}): SQL {
  const parts: SQL[] = [cleanReadyMediaFilter(input.userId)];

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
    // jsonb arrays serialized as text — matches tags/objects/scenes
    clauses.push(sql`${media.sceneTags}::text ilike ${pattern}`);
    clauses.push(sql`${media.aiTags}::text ilike ${pattern}`);
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
}): Promise<MediaQueryDiagnostics> {
  const db = getDb();

  const [cleanRow] = await db
    .select({ value: count() })
    .from(media)
    .where(cleanReadyMediaFilter(input.userId));
  const cleanReadyTotal = Number(cleanRow?.value ?? 0);

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
              cleanReadyMediaFilter(input.userId),
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
      .where(and(cleanReadyMediaFilter(input.userId), dateSql));
    withDateOnly = Number(row?.value ?? 0);
  }

  const peopleWithoutFaces: Array<{ id: string; name: string | null }> = [];
  if (input.peopleIds.length > 0) {
    const faceCounts = await db
      .select({
        personId: faces.personId,
        faceCount: count(),
      })
      .from(faces)
      .where(
        and(
          eq(faces.userId, input.userId),
          inArray(faces.personId, input.peopleIds),
        ),
      )
      .groupBy(faces.personId);

    const counted = new Map(
      faceCounts
        .filter((row) => row.personId)
        .map((row) => [row.personId!, Number(row.faceCount) || 0]),
    );

    const nameRows = await db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(
        and(eq(people.userId, input.userId), inArray(people.id, input.peopleIds)),
      );
    const names = new Map(nameRows.map((row) => [row.id, row.name]));

    for (const id of input.peopleIds) {
      if ((counted.get(id) ?? 0) === 0) {
        peopleWithoutFaces.push({ id, name: names.get(id) ?? null });
      }
    }
  }

  return {
    matchedCount: input.matchedCount,
    cleanReadyTotal,
    withPeopleOnly,
    withDateOnly,
    peopleWithoutFaces,
    dateFilterApplied: Boolean(input.dateFilter),
    dateFilterConcrete: Boolean(input.dateFilter?.isConcrete),
    dateLabel: input.dateFilter?.label,
    textHintsApplied: input.textHints.length > 0,
    peopleMatch: input.peopleMatch,
    peopleIdCount: input.peopleIds.length,
  };
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
