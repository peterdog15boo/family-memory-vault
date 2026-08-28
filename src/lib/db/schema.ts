import type {
  AssistantActionResult,
  AssistantActionStatus,
  AssistantActionType,
  AssistantIntent,
  AssistantMessageMetadata,
  AssistantMessageRole,
} from "@/lib/assistant/types";
import {
  ASSISTANT_ACTION_STATUSES,
  ASSISTANT_ACTIONS,
  ASSISTANT_MESSAGE_ROLES,
} from "@/lib/assistant/types";
import { MODERATION_STATUSES, type ModerationLabels } from "@/lib/moderation/types";
import type { MemorySettings } from "@/lib/memories/settings";
import type { MovieSettings } from "@/lib/movies/settings";
import type {
  FaceBoundingBox,
  FaceEmbedding,
} from "@/lib/people/types";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Pipeline / lifecycle status for a media object. */
export const MEDIA_STATUSES = [
  "uploaded",
  "pending_moderation",
  "ready",
  "rejected",
  "csam_quarantined",
] as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const MEDIA_TYPES = ["photo", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEMORY_TYPES = ["album", "story"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** How a memory is shared with the owner's family (when sharedWithFamily). */
export const MEMORY_FAMILY_ACCESS_LEVELS = ["view", "contribute"] as const;
export type MemoryFamilyAccess = (typeof MEMORY_FAMILY_ACCESS_LEVELS)[number];

/** Generated movie (memory → rendered video) pipeline status. */
export const MOVIE_STATUSES = [
  "queued",
  "processing",
  "ready",
  "failed",
] as const;
export type MovieStatus = (typeof MOVIE_STATUSES)[number];

/** Preset visual themes for generated movies. */
export const MOVIE_STYLES = [
  "holiday",
  "birthday",
  "cinematic",
  "simple",
  "vintage",
  "bright",
] as const;
export type MovieStyle = (typeof MOVIE_STYLES)[number];

export const PROCESSING_JOB_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number];

/** Supported notification types. */
export const NOTIFICATION_TYPES = [
  "media_ready",
  "movie_ready",
  "memory_created",
  "family_invite",
  "family_milestone",
  "legacy_milestone",
  "storage_warning",
  "moderation_attention",
  "emergency_access",
  "family_chat",
  "photo_request",
  "weekly_digest",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Roles within a shared family / household. */
export const FAMILY_MEMBER_ROLES = ["owner", "member", "viewer"] as const;
export type FamilyMemberRole = (typeof FAMILY_MEMBER_ROLES)[number];

/** Membership lifecycle for family invites. */
export const FAMILY_MEMBER_STATUSES = [
  "pending",
  "active",
  "declined",
  "removed",
] as const;
export type FamilyMemberStatus = (typeof FAMILY_MEMBER_STATUSES)[number];

/** Stripe-aligned subscription lifecycle. */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Built-in plan slugs — keep in sync with seed catalog. */
export const PLAN_SLUGS = ["free", "family", "family_plus", "legacy"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

/** Additive feature flags stored on plans.features (JSONB). */
export type PlanFeatures = {
  familySharing: boolean;
  faceDetection: boolean;
  cinematicThemes: boolean;
  priorityRender: boolean;
  /** Soft cap on People identities; omit or null = unlimited. */
  maxPeople?: number | null;
  /** Soft label for marketing / settings UI. */
  supportLevel?: "community" | "standard" | "priority";
  /** Optional AI movie soundtrack generation (legitimate music APIs only). */
  aiSoundtrack?: boolean;
  /** Monthly cap for completed AI soundtrack jobs; 0 = none. */
  maxAiSoundtracksPerMonth?: number;
  /** Paid plans omit the soft “Made with Family Memory Vault” movie watermark. */
  removeMovieWatermark?: boolean;
  /** Interactive family tree (Family / Family Plus / Legacy+). */
  familyTree?: boolean;
  [key: string]: unknown;
};

/** Lifecycle for family photo contribution requests. */
export const PHOTO_REQUEST_STATUSES = [
  "pending",
  "completed",
  "cancelled",
] as const;
export type PhotoRequestStatus = (typeof PHOTO_REQUEST_STATUSES)[number];

export const mediaStatusEnum = pgEnum("media_status", MEDIA_STATUSES);
export const mediaTypeEnum = pgEnum("media_type", MEDIA_TYPES);
export const memoryTypeEnum = pgEnum("memory_type", MEMORY_TYPES);
export const memoryFamilyAccessEnum = pgEnum(
  "memory_family_access",
  MEMORY_FAMILY_ACCESS_LEVELS,
);
export const movieStatusEnum = pgEnum("movie_status", MOVIE_STATUSES);
export const movieStyleEnum = pgEnum("movie_style", MOVIE_STYLES);
export const moderationStatusEnum = pgEnum(
  "moderation_status",
  MODERATION_STATUSES,
);
export const processingJobStatusEnum = pgEnum(
  "processing_job_status",
  PROCESSING_JOB_STATUSES,
);
export const familyMemberRoleEnum = pgEnum(
  "family_member_role",
  FAMILY_MEMBER_ROLES,
);
export const familyMemberStatusEnum = pgEnum(
  "family_member_status",
  FAMILY_MEMBER_STATUSES,
);
export const subscriptionStatusEnum = pgEnum(
  "subscription_status",
  SUBSCRIPTION_STATUSES,
);
export const assistantMessageRoleEnum = pgEnum(
  "assistant_message_role",
  ASSISTANT_MESSAGE_ROLES,
);
export const assistantActionTypeEnum = pgEnum(
  "assistant_action_type",
  ASSISTANT_ACTIONS,
);
export const assistantActionStatusEnum = pgEnum(
  "assistant_action_status",
  ASSISTANT_ACTION_STATUSES,
);

export type { ModerationLabels };

/** Manual Ava helper acknowledgments (derived tasks stay live from vault data). */
export type AvaHelperProgress = {
  welcomeSeen?: boolean;
  screenNameSet?: boolean;
  avatarSet?: boolean;
  avatarSkipped?: boolean;
  photosReadyCelebrated?: boolean;
  /** Ava already auto-prompted the first-Memory nudge. */
  encourageMemoryPrompted?: boolean;
  /** User chose “later” on the first-Memory nudge (resume can show again). */
  encourageMemorySkipped?: boolean;
  /** Soft-skipped creating a Memory (still completes if they create one later). */
  createMemorySkipped?: boolean;
  /** Celebrated first Memory existing. */
  memoryCelebrated?: boolean;
  peopleExplained?: boolean;
  peopleSkipped?: boolean;
  movieSkipped?: boolean;
  askAiSkipped?: boolean;
  inviteSkipped?: boolean;
  /**
   * First ready movie completed — Ava may encourage inviting one family member.
   * Cleared / one-shot via inviteAfterFirstMoviePrompted.
   */
  inviteAfterFirstMovieReady?: boolean;
  /** Ava already auto-opened the post-first-movie invite tip. */
  inviteAfterFirstMoviePrompted?: boolean;
  documentsIntroSeen?: boolean;
  documentsSkipped?: boolean;
  completionCelebrated?: boolean;
};

/**
 * App-level user profile keyed to Clerk user id.
 * Includes legacy checklist fields + Ava guided-helper state (same jsonb).
 */
export type UserOnboardingState = {
  /** Set true only when the app user row is first created — legacy users stay hidden. */
  eligible?: boolean;
  /** When the user first acknowledged the welcome step. */
  welcomeSeenAt?: string | null;
  /** User chose Skip / dismiss — hide checklist permanently. */
  dismissedAt?: string | null;
  /** Key steps done (welcome + first upload) — set automatically. */
  completedAt?: string | null;

  /* —— Ava guided helper —— */
  /** Master switch; default true for eligible users. */
  helperEnabled?: boolean;
  /** Soft dismiss — app stays usable; resume chip remains. */
  helperDismissedAt?: string | null;
  /** Last focused Ava step id. */
  helperStep?: string | null;
  /** Preferred screen name chosen with Ava (also synced to display_name). */
  screenName?: string | null;
  /** Optional clean media used as Ava / profile avatar. */
  avatarMediaId?: string | null;
  /** Optional external avatar URL (e.g. Clerk image). */
  avatarUrl?: string | null;
  /** When Ava’s core path finished. */
  helperCompletedAt?: string | null;
  /** Manual step flags / celebrations. */
  helperProgress?: AvaHelperProgress;
  /**
   * “Your First Family Movie” first-session ritual completed (ISO timestamp).
   * Once set, the special flow never runs again for this vault.
   */
  firstFamilyMovieCompletedAt?: string | null;
  /** Movie id created during the ritual (for reveal resume / deep links). */
  firstFamilyMovieId?: string | null;
  /** When the theatrical Big Reveal was watched / continued. */
  firstFamilyMovieRevealSeenAt?: string | null;
};

/**
 * Account & privacy preferences (Settings).
 * Defaults favor useful alerts on; product/marketing email is opt-in.
 */
export type UserAccountPreferences = {
  emailMovieReady?: boolean;
  emailFamilyInvite?: boolean;
  emailStorageWarnings?: boolean;
  inAppMovieReady?: boolean;
  inAppFamilyInvite?: boolean;
  inAppStorageWarnings?: boolean;
  inAppMediaReady?: boolean;
  inAppEmergencyAccess?: boolean;
  /** Soft ding when a new in-app notification arrives while the app is open. */
  notificationSoundEnabled?: boolean;
  /** Celebration chime — muted by default. */
  celebrationSoundEnabled?: boolean;
  /**
   * Occasional short spoken greeting when Ask AI opens.
   * Default ON. Distinct from celebration / notification sounds.
   */
  askAiRobotGreetingsEnabled?: boolean;
  /** Rare milestone emails (first photo, 50 photos, first family join, 50% legacy). */
  emailMilestoneCelebrations?: boolean;
  /** Weekly vault highlights email — default on, one email per week max. */
  emailWeeklyDigest?: boolean;
  /** Weekly vault highlights in the notification bell. */
  inAppWeeklyDigest?: boolean;
  /** Occasional product updates — opt-in only. */
  productUpdatesEmail?: boolean;
  /**
   * Automated feature-discovery tips (invite family, make a movie, etc.).
   * Default on; respects the same 7-day cadence as other lifecycle mail.
   */
  emailFeatureTips?: boolean;
  /**
   * Automatically log out after inactivity (bank-style idle timeout).
   * Persisted as `idle_timeout_enabled` conceptually / `idleTimeoutEnabled` in JSON.
   * Default ON. Free plans always enforce ON regardless of this value.
   */
  idleTimeoutEnabled?: boolean;
  /** Internal dedupe for storage warning emails when in-app is off. */
  lastStorageWarningAt?: string | null;
  /** Internal dedupe for weekly digest sends (ISO timestamp). */
  lastWeeklyDigestAt?: string | null;
  /** Internal dedupe for automated feature-tip emails (ISO timestamp). */
  lastLifecycleEmailAt?: string | null;
  /**
   * Campaign keys already sent (invite_family, try_family_chat, …).
   * Each tip is sent at most once; feature use also suppresses eligibility.
   */
  lifecycleEmailsSent?: string[];
  /** UI locale (BCP 47), e.g. en-US. */
  locale?: string | null;
};

export const DEFAULT_USER_ACCOUNT_PREFERENCES: Required<UserAccountPreferences> =
  {
    emailMovieReady: true,
    emailFamilyInvite: true,
    emailStorageWarnings: true,
    inAppMovieReady: true,
    inAppFamilyInvite: true,
    inAppStorageWarnings: true,
    inAppMediaReady: true,
    inAppEmergencyAccess: true,
    notificationSoundEnabled: true,
    celebrationSoundEnabled: false,
    askAiRobotGreetingsEnabled: true,
    emailMilestoneCelebrations: true,
    emailWeeklyDigest: true,
    inAppWeeklyDigest: true,
    productUpdatesEmail: false,
    emailFeatureTips: true,
    idleTimeoutEnabled: true,
    lastStorageWarningAt: null,
    lastWeeklyDigestAt: null,
    lastLifecycleEmailAt: null,
    lifecycleEmailsSent: [],
    locale: "en-US",
  };

/** How much location a user shares with active family members. Default off. */
export const LOCATION_SHARING_LEVELS = ["off", "city", "precise"] as const;
export type LocationSharingLevel = (typeof LOCATION_SHARING_LEVELS)[number];

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    imageUrl: text("image_url"),
    /** Lightweight onboarding checklist state (dismiss + welcome seen). */
    onboarding: jsonb("onboarding")
      .$type<UserOnboardingState>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    /** Email + in-app notification / privacy preferences. */
    accountPreferences: jsonb("account_preferences")
      .$type<UserAccountPreferences>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    /** Family map: off by default — never inferred from IP. */
    locationSharing: text("location_sharing")
      .$type<LocationSharingLevel>()
      .default("off")
      .notNull(),
    /** Human-readable label shown to family, e.g. "Austin, TX". */
    locationLabel: text("location_label"),
    locationCity: text("location_city"),
    locationRegion: text("location_region"),
    locationCountry: text("location_country"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
    /** Platform admin — access to /admin tools. Prefer DB flag; ADMIN_USER_IDS is bootstrap. */
    isAdmin: boolean("is_admin").default(false).notNull(),
    /** Soft suspend — blocks app access when set. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    /** Optional admin note when suspending. */
    suspendedReason: text("suspended_reason"),
    /** Last time ensureAppUser / app shell touched this row. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_suspended_at_idx").on(table.suspendedAt),
    index("users_last_active_at_idx").on(table.lastActiveAt),
    index("users_location_sharing_idx").on(table.locationSharing),
  ],
);

/**
 * Photos and videos stored in R2.
 * Never serve to family surfaces unless status === ready and moderation is clean.
 */
export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: mediaTypeEnum("type").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    originalFilename: text("original_filename"),

    /** R2 object keys */
    originalKey: text("original_key").notNull(),
    processedKey: text("processed_key"),
    thumbnailKey: text("thumbnail_key"),

    /** Lifecycle pipeline status */
    status: mediaStatusEnum("status").default("uploaded").notNull(),

    /** Detailed moderation outcome */
    moderationStatus: moderationStatusEnum("moderation_status")
      .default("pending")
      .notNull(),
    moderationLabels: jsonb("moderation_labels").$type<ModerationLabels>(),

    photodnaMatch: boolean("photodna_match").default(false).notNull(),
    aiCsamScore: doublePrecision("ai_csam_score"),
    aiNudityScore: doublePrecision("ai_nudity_score"),

    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    ncmecReportId: text("ncmec_report_id"),
    ncmecReportedAt: timestamp("ncmec_reported_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),

    /**
     * Visual scene understanding (Rekognition labels / vision caption).
     * Filled async after clean+ready; used by Ask AI scene search.
     */
    sceneCaption: text("scene_caption"),
    sceneTags: jsonb("scene_tags").$type<string[]>().default([]).notNull(),
    sceneAnalyzedAt: timestamp("scene_analyzed_at", { withTimezone: true }),
    /** null | pending | ready | failed | skipped */
    sceneAnalysisStatus: text("scene_analysis_status"),

    /**
     * Rich AI visual metadata for Ask AI object/scene search.
     * Prefer these over scene_* when present; scene_* stays for compatibility.
     */
    aiCaption: text("ai_caption"),
    aiTags: jsonb("ai_tags").$type<string[]>().default([]).notNull(),
    aiObjects: jsonb("ai_objects").$type<string[]>().default([]).notNull(),
    aiScenes: jsonb("ai_scenes").$type<string[]>().default([]).notNull(),
    aiDescription: text("ai_description"),
    aiEmbedding: jsonb("ai_embedding").$type<number[] | null>(),
    visualAnalyzedAt: timestamp("visual_analyzed_at", { withTimezone: true }),

    /**
     * User-edited keywords (distinct from AI tags). Merged into Ask AI /
     * Photos search alongside ai_tags. Case-insensitive unique per media.
     */
    userTags: jsonb("user_tags").$type<string[]>().default([]).notNull(),

    /**
     * Family-writable caption for Photos library (clean/ready only).
     * Distinct from AI captions (`ai_caption` / `scene_caption`).
     */
    caption: text("caption"),
    captionUpdatedAt: timestamp("caption_updated_at", { withTimezone: true }),
    captionUpdatedByUserId: text("caption_updated_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),

    /**
     * AI labels the user explicitly removed. Kept so re-analysis does not
     * restore them; also used to filter display/search if arrays are stale.
     */
    dismissedAiTags: jsonb("dismissed_ai_tags")
      .$type<string[]>()
      .default([])
      .notNull(),

    /**
     * Cached Ken Burns / subject framing (normalized 0–1).
     * Filled from face detections; reused by movie export + preview MP4.
     */
    focalPointX: doublePrecision("focal_point_x"),
    focalPointY: doublePrecision("focal_point_y"),
    subjectBounds: jsonb("subject_bounds").$type<{
      x: number;
      y: number;
      width: number;
      height: number;
      faceCount: number;
      meanFaceArea: number;
      signature: string;
    } | null>(),
    framingUpdatedAt: timestamp("framing_updated_at", { withTimezone: true }),

    /**
     * Optional import provenance (device upload omits these).
     * Used for dedupe + disconnect audits — never bypasses moderation.
     */
    importProvider: text("import_provider"),
    importExternalId: text("import_external_id"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    /**
     * SHA-256 hex of file bytes when known (client or cloud import).
     * Practical dedupe across re-uploads / re-imports of the same file.
     */
    contentHash: text("content_hash"),
    /**
     * When set, auto-link to this owned memory after clean+ready.
     * Cleared after attach attempt (success or permanent skip).
     */
    pendingMemoryId: text("pending_memory_id"),

    /**
     * Original capture / taken time when known (EXIF, import provider).
     * On This Day prefers this over created_at; null ⇒ no capture metadata yet.
     */
    takenAt: timestamp("taken_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("media_user_id_idx").on(table.userId),
    index("media_status_idx").on(table.status),
    index("media_moderation_status_idx").on(table.moderationStatus),
    index("media_user_id_status_idx").on(table.userId, table.status),
    /** Family-safe gallery: filter by owner + clean/ready, order by created_at. */
    index("media_user_clean_ready_created_idx").on(
      table.userId,
      table.moderationStatus,
      table.status,
      table.createdAt,
    ),
    index("media_taken_at_idx").on(table.takenAt),
    index("media_user_clean_ready_taken_idx").on(
      table.userId,
      table.moderationStatus,
      table.status,
      table.takenAt,
    ),
    index("media_photodna_match_idx").on(table.photodnaMatch),
    index("media_ncmec_report_id_idx").on(table.ncmecReportId),
    index("media_scene_analyzed_at_idx").on(table.sceneAnalyzedAt),
    index("media_user_scene_status_idx").on(
      table.userId,
      table.sceneAnalysisStatus,
    ),
    index("media_visual_analyzed_at_idx").on(table.visualAnalyzedAt),
    uniqueIndex("media_import_dedupe_uidx")
      .on(table.userId, table.importProvider, table.importExternalId)
      .where(
        sql`${table.importProvider} is not null and ${table.importExternalId} is not null`,
      ),
    uniqueIndex("media_user_content_hash_uidx")
      .on(table.userId, table.contentHash)
      .where(sql`${table.contentHash} is not null`),
    index("media_pending_memory_id_idx").on(table.pendingMemoryId),
    index("media_import_provider_idx").on(table.userId, table.importProvider),
  ],
);

/**
 * Family comment thread on a media item (clean/ready only).
 * The original `media.caption` remains the first feed entry when present.
 */
export const mediaComments = pgTable(
  "media_comments",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (table) => [
    index("media_comments_media_id_created_at_idx").on(
      table.mediaId,
      table.createdAt,
    ),
    index("media_comments_user_id_idx").on(table.userId),
  ],
);

/**
 * Albums and stories owned by a user.
 *
 * Cover media should always be the owner's clean/ready media — enforced in
 * `src/lib/memories.ts`. Family surfaces never resolve an unclean cover.
 */
export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: memoryTypeEnum("type").default("album").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** Optional cover — FK set-null on delete; helpers only accept clean media. */
    coverMediaId: text("cover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    /**
     * Flexible preferences (slideshow transition, duration, future music, etc.).
     * Shape: MemorySettings in src/lib/memories/settings.ts
     */
    settings: jsonb("settings").$type<MemorySettings>().default({}).notNull(),
    /**
     * When true, active members of any family shared with the owner can access
     * this memory (subject to familyAccess + their family role).
     */
    sharedWithFamily: boolean("shared_with_family").default(false).notNull(),
    /** view = read-only for family; contribute = eligible members may edit. */
    familyAccess: memoryFamilyAccessEnum("family_access")
      .default("view")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("memories_user_id_idx").on(table.userId),
    index("memories_type_idx").on(table.type),
    index("memories_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("memories_shared_family_created_idx").on(
      table.sharedWithFamily,
      table.createdAt,
    ),
    /** Shared library: user_id IN (…) AND shared_with_family ORDER BY created_at */
    index("memories_user_shared_created_idx").on(
      table.userId,
      table.sharedWithFamily,
      table.createdAt,
    ),
  ],
);

/**
 * Join table: which media belongs to which memory, with ordering.
 *
 * Rows may reference media that later fails moderation; read helpers filter to
 * clean + ready only so family UIs never surface unsafe items.
 */
export const memoryMedia = pgTable(
  "memory_media",
  {
    memoryId: text("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    caption: text("caption"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "memory_media_pk",
      columns: [table.memoryId, table.mediaId],
    }),
    index("memory_media_media_id_idx").on(table.mediaId),
    index("memory_media_memory_id_sort_idx").on(
      table.memoryId,
      table.sortOrder,
    ),
  ],
);

/**
 * Generated movie jobs rendered from a memory's clean media.
 * Output lives in R2 (`output_key` / `thumbnail_key`); never serve until status=ready.
 */
export const movies = pgTable(
  "movies",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: movieStatusEnum("status").default("queued").notNull(),
    style: movieStyleEnum("style").default("simple").notNull(),
    /** Duration, music, transitions, etc. — see MovieSettings. */
    settings: jsonb("settings").$type<MovieSettings>().default({}).notNull(),
    /** R2 object key for the final rendered video (set when ready). */
    outputKey: text("output_key"),
    thumbnailKey: text("thumbnail_key"),
    durationSeconds: doublePrecision("duration_seconds"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("movies_user_id_idx").on(table.userId),
    index("movies_memory_id_idx").on(table.memoryId),
    index("movies_status_idx").on(table.status),
    index("movies_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("movies_memory_id_created_at_idx").on(
      table.memoryId,
      table.createdAt,
    ),
  ],
);

/**
 * Durable public share links for ready movies.
 * Token resolves to a marketing page that only exposes that one movie.
 */
export const movieShares = pgTable(
  "movie_shares",
  {
    id: text("id").primaryKey(),
    movieId: text("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Opaque public token (URL segment). */
    token: text("token").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    viewCount: integer("view_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("movie_shares_token_uidx").on(table.token),
    index("movie_shares_movie_id_idx").on(table.movieId),
    index("movie_shares_user_id_idx").on(table.userId),
  ],
);

/**
 * Named person identities for face grouping (per vault user).
 * `cover_face_id` points at a representative face thumbnail (optional).
 */
export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Representative face for avatars — FK is circular with faces, resolved lazily. */
    coverFaceId: text("cover_face_id").references((): AnyPgColumn => faces.id, {
      onDelete: "set null",
    }),
    /**
     * Manual avatar framing (normalized 0–1 focus + zoom ≥ 1).
     * When null, UI derives framing from the cover face bounding box.
     */
    avatarFocusX: doublePrecision("avatar_focus_x"),
    avatarFocusY: doublePrecision("avatar_focus_y"),
    avatarZoom: doublePrecision("avatar_zoom"),
    /**
     * AI “Notes from photos” — helper summary from captions/comments.
     * Human Story posts live in `person_story_posts` (never overwritten by notes).
     */
    storyBody: text("story_body"),
    storySourceCaptionCount: integer("story_source_caption_count")
      .default(0)
      .notNull(),
    storyGeneratedAt: timestamp("story_generated_at", { withTimezone: true }),
    /** system (auto) | user (refresh notes) */
    storyGeneratedBy: text("story_generated_by").$type<"system" | "user">(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("people_user_id_idx").on(table.userId),
    index("people_user_id_name_idx").on(table.userId, table.name),
    index("people_cover_face_id_idx").on(table.coverFaceId),
    /** listPeopleForUser orders by updated_at */
    index("people_user_id_updated_at_idx").on(table.userId, table.updatedAt),
  ],
);

/**
 * Human Story posts about a person — the real family feed.
 * AI photo notes stay on `people.story_*` and never overwrite these.
 */
export const personStoryPosts = pgTable(
  "person_story_posts",
  {
    id: text("id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (table) => [
    index("person_story_posts_person_id_created_at_idx").on(
      table.personId,
      table.createdAt,
    ),
    index("person_story_posts_author_user_id_idx").on(table.authorUserId),
  ],
);

/**
 * Canonical relationship types for the family tree.
 * - parent_of: from = parent, to = child
 * - niece_of / nephew_of: from = niece/nephew, to = aunt/uncle (etc.)
 * - partner_of / sibling_of / cousin_of / in-laws / other: undirected;
 *   stored with fromNodeId < toNodeId
 * Derived grandparent/sibling edges are never auto-invented as stored rows.
 */
export const FAMILY_TREE_RELATION_TYPES = [
  "parent_of",
  "partner_of",
  "sibling_of",
  "cousin_of",
  "niece_of",
  "nephew_of",
  "sister_in_law_of",
  "brother_in_law_of",
  "other_relative_of",
] as const;
export type FamilyTreeRelationType =
  (typeof FAMILY_TREE_RELATION_TYPES)[number];

/**
 * A node on a family's tree (exactly one tree per family).
 * May link to a People identity (photo) or remain a label-only placeholder.
 * `userId` is the People-vault owner (usually the family creator) for person links.
 */
export const familyTreeNodes = pgTable(
  "family_tree_nodes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Family this tree belongs to. Required for new rows; backfilled for legacy. */
    familyId: text("family_id").references((): AnyPgColumn => families.id, {
      onDelete: "cascade",
    }),
    /** Optional link to a People record in the people-owner vault. */
    personId: text("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    /** Display label (placeholder name or override). Always required. */
    label: text("label").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_tree_nodes_user_id_idx").on(table.userId),
    index("family_tree_nodes_family_id_idx").on(table.familyId),
    index("family_tree_nodes_person_id_idx").on(table.personId),
    // One People link per family tree (same vault person may appear on multiple families).
    uniqueIndex("family_tree_nodes_family_person_uidx")
      .on(table.familyId, table.personId)
      .where(sql`${table.personId} is not null and ${table.familyId} is not null`),
  ],
);

/**
 * Directed/canonical edges between tree nodes (scoped to a family).
 */
export const familyTreeRelationships = pgTable(
  "family_tree_relationships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: text("family_id").references((): AnyPgColumn => families.id, {
      onDelete: "cascade",
    }),
    fromNodeId: text("from_node_id")
      .notNull()
      .references(() => familyTreeNodes.id, { onDelete: "cascade" }),
    toNodeId: text("to_node_id")
      .notNull()
      .references(() => familyTreeNodes.id, { onDelete: "cascade" }),
    type: text("type").$type<FamilyTreeRelationType>().notNull(),
    /**
     * For partner_of edges: current vs former (divorced / separated).
     * Null/ignored for other relationship types.
     */
    partnerStatus: text("partner_status").$type<"current" | "former" | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_tree_rels_user_id_idx").on(table.userId),
    index("family_tree_rels_family_id_idx").on(table.familyId),
    index("family_tree_rels_from_idx").on(table.fromNodeId),
    index("family_tree_rels_to_idx").on(table.toNodeId),
    uniqueIndex("family_tree_rels_edge_uidx").on(
      table.userId,
      table.fromNodeId,
      table.toNodeId,
      table.type,
    ),
  ],
);

/**
 * Individual detected faces on a media object.
 * `person_id` is null until the face is assigned / clustered into a person.
 * No separate face_media join — each face row already belongs to one media.
 */
export const faces = pgTable(
  "faces",
  {
    id: text("id").primaryKey(),
    /** People-graph owner (viewer). May differ from media.user_id for shared family photos. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    personId: text("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    boundingBox: jsonb("bounding_box").$type<FaceBoundingBox>().notNull(),
    /** Model embedding for similarity grouping (optional until detector wired). */
    embedding: jsonb("embedding").$type<FaceEmbedding>(),
    /** Opaque vendor face id / token (Rekognition FaceId, etc.). */
    faceToken: text("face_token"),
    confidence: doublePrecision("confidence"),
    /** Detector provider label for audit (e.g. rekognition, mock). */
    provider: text("provider"),
    /**
     * For faces detected on video sample frames: offset into the video (ms).
     * Used to re-extract the same frame for identity matching / crops.
     */
    sourceFrameMs: integer("source_frame_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("faces_media_id_idx").on(table.mediaId),
    index("faces_person_id_idx").on(table.personId),
    index("faces_user_id_idx").on(table.userId),
    index("faces_user_id_person_id_idx").on(table.userId, table.personId),
    index("faces_face_token_idx").on(table.faceToken),
    /** Person photo galleries order faces by created_at */
    index("faces_user_person_created_idx").on(
      table.userId,
      table.personId,
      table.createdAt,
    ),
  ],
);

/**
 * Database-backed processing / moderation job queue.
 * Stand-in for Cloudflare Queues until that is wired up.
 */
export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: processingJobStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    lastError: text("last_error"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("processing_jobs_status_available_at_idx").on(
      table.status,
      table.availableAt,
    ),
    index("processing_jobs_type_idx").on(table.type),
    index("processing_jobs_media_id_idx").on(table.mediaId),
  ],
);

/**
 * Append-only audit trail for moderation decisions and automated scans.
 */
export const moderationEvents = pgTable(
  "moderation_events",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    source: text("source").notNull(),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    previousModerationStatus: text("previous_moderation_status"),
    newModerationStatus: text("new_moderation_status"),
    labels: jsonb("labels").$type<ModerationLabels>(),
    aiCsamScore: doublePrecision("ai_csam_score"),
    aiNudityScore: doublePrecision("ai_nudity_score"),
    photodnaMatch: boolean("photodna_match"),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("moderation_events_media_id_idx").on(table.mediaId),
    index("moderation_events_event_type_idx").on(table.eventType),
    index("moderation_events_created_at_idx").on(table.createdAt),
    index("moderation_events_source_idx").on(table.source),
  ],
);

/**
 * Shared family / household vault group.
 * Content ownership stays on media/memories; membership gates who can see shareable items.
 */
export const families = pgTable(
  "families",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** User who created the family (always an owner member as well). */
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
 * When true, active members with canViewTree may open this family's Family Tree.
 * Default on once a tree exists for the family; contribution still needs canContributeTree.
 */
    treeSharedWithFamily: boolean("tree_shared_with_family")
      .default(true)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("families_created_by_user_id_idx").on(table.createdByUserId),
    index("families_name_idx").on(table.name),
  ],
);

/**
 * Registry: a family has at most one tree. Created on first open / explicit create.
 */
export const familyTrees = pgTable(
  "family_trees",
  {
    familyId: text("family_id")
      .primaryKey()
      .references(() => families.id, { onDelete: "cascade" }),
    /** People-vault / billing owner for this tree (usually family creator). */
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_trees_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

/**
 * Membership + invite rows for a family.
 * Pending invites may have null userId until the invitee accepts and links their account.
 */
export const familyMembers = pgTable(
  "family_members",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    /** Set when the member has an account / after invite acceptance. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    role: familyMemberRoleEnum("role").notNull().default("member"),
    status: familyMemberStatusEnum("status").notNull().default("pending"),
    /** Email the invite was sent to (normalized lowercase). */
    invitedEmail: text("invited_email").notNull(),
    /** Opaque token for accept-invite links; null for seeded owner rows. */
    inviteToken: text("invite_token"),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** First photo or memory this member added after joining. */
    firstContributedAt: timestamp("first_contributed_at", {
      withTimezone: true,
    }),
    /**
     * Family Tree ACL (when family.treeSharedWithFamily is on).
     * Defaults: view off until share is enabled; contribute always opt-in.
     */
    canViewTree: boolean("can_view_tree").default(false).notNull(),
    canContributeTree: boolean("can_contribute_tree").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_members_family_id_idx").on(table.familyId),
    index("family_members_user_id_idx").on(table.userId),
    index("family_members_invited_email_idx").on(table.invitedEmail),
    index("family_members_family_status_idx").on(table.familyId, table.status),
    uniqueIndex("family_members_invite_token_uidx").on(table.inviteToken),
    uniqueIndex("family_members_family_user_uidx").on(
      table.familyId,
      table.userId,
    ),
    uniqueIndex("family_members_family_email_uidx").on(
      table.familyId,
      table.invitedEmail,
    ),
  ],
);

/**
 * Ask a family member / invitee to upload photos (contribution request).
 * Deep-linked via token; never exposes the requester’s private library.
 */
export const photoRequests = pgTable(
  "photo_requests",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetMemberId: text("target_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    memoryId: text("memory_id").references(() => memories.id, {
      onDelete: "set null",
    }),
    personId: text("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    status: text("status").$type<PhotoRequestStatus>().default("pending").notNull(),
    token: text("token").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("photo_requests_token_uidx").on(table.token),
    index("photo_requests_family_id_idx").on(table.familyId),
    index("photo_requests_target_member_idx").on(table.targetMemberId),
    index("photo_requests_requested_by_idx").on(table.requestedByUserId),
    index("photo_requests_status_idx").on(table.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* Family Chat (one group thread per family vault)                            */
/* -------------------------------------------------------------------------- */

export const familyChatThreads = pgTable(
  "family_chat_threads",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_chat_threads_family_id_idx").on(table.familyId),
    index("family_chat_threads_family_updated_idx").on(
      table.familyId,
      table.updatedAt,
    ),
  ],
);

/**
 * Family-level chat eligibility (owner can opt members out of all chat).
 * Separate from per-thread participants.
 */
export const familyChatEligibility = pgTable(
  "family_chat_eligibility",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eligible: boolean("eligible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("family_chat_eligibility_family_user_uidx").on(
      table.familyId,
      table.userId,
    ),
    index("family_chat_eligibility_family_eligible_idx").on(
      table.familyId,
      table.eligible,
    ),
  ],
);

export const familyChatParticipants = pgTable(
  "family_chat_participants",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => familyChatThreads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Legacy column from single-thread model. Thread membership is presence in
     * this table; family-level opt-out lives on family_chat_eligibility.
     */
    included: boolean("included").notNull().default(true),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("family_chat_participants_thread_user_uidx").on(
      table.threadId,
      table.userId,
    ),
    index("family_chat_participants_user_id_idx").on(table.userId),
    index("family_chat_participants_thread_included_idx").on(
      table.threadId,
      table.included,
    ),
  ],
);

export const familyChatMessages = pgTable(
  "family_chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => familyChatThreads.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_chat_messages_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    index("family_chat_messages_sender_idx").on(table.senderUserId),
  ],
);

/**
 * Product catalog — Free / Family / Family Plus / Legacy.
 * Limits drive enforcement; Stripe price ids live in features or env later.
 */
export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /** Price in USD cents. 0 = free. */
    priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
    priceYearlyCents: integer("price_yearly_cents").notNull().default(0),
    /** Null = unlimited storage. */
    storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
    maxFamilyMembers: integer("max_family_members").notNull().default(1),
    maxMoviesPerMonth: integer("max_movies_per_month").notNull().default(5),
    /** Soft concurrent movie.render jobs. */
    maxActiveMovieJobs: integer("max_active_movie_jobs").notNull().default(1),
    features: jsonb("features").$type<PlanFeatures>().notNull().default(sql`'{}'::jsonb`),
    /** Sort order in pricing UI (lower first). */
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("plans_slug_uidx").on(table.slug),
    index("plans_is_active_sort_idx").on(table.isActive, table.sortOrder),
  ],
);

/**
 * Billing subscription — typically per user; family_id reserved for household billing.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    familyId: text("family_id").references(() => families.id, {
      onDelete: "cascade",
    }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    /** monthly | yearly | none (free). */
    billingInterval: text("billing_interval").default("none").notNull(),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    /**
     * How this plan was assigned: stripe | admin | beta | free.
     * Beta mode (BETA_BILLING_OVERRIDE) writes `beta` — see BILLING.md undo notes.
     */
    planSource: text("plan_source"),
    planAssignedAt: timestamp("plan_assigned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_family_id_idx").on(table.familyId),
    index("subscriptions_plan_id_idx").on(table.planId),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_plan_source_idx").on(table.planSource),
    uniqueIndex("subscriptions_stripe_subscription_id_uidx").on(
      table.stripeSubscriptionId,
    ),
    uniqueIndex("subscriptions_user_id_uidx").on(table.userId),
  ],
);

/**
 * Monthly usage snapshots (storage + movie generation) per user.
 * period_key is UTC `YYYY-MM`.
 */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: text("family_id").references(() => families.id, {
      onDelete: "set null",
    }),
    periodKey: text("period_key").notNull(),
    storageBytes: bigint("storage_bytes", { mode: "number" })
      .notNull()
      .default(0),
    moviesCreated: integer("movies_created").notNull().default(0),
    mediaCount: integer("media_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("usage_records_user_id_idx").on(table.userId),
    index("usage_records_period_key_idx").on(table.periodKey),
    uniqueIndex("usage_records_user_period_uidx").on(
      table.userId,
      table.periodKey,
    ),
  ],
);

/**
 * In-app notification inbox — one row per event shown to a user.
 * read_at = null means unread. Soft-delete via read_at or hard-delete by TTL.
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  ...NOTIFICATION_TYPES,
]);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    /** Deep link inside the app, e.g. "/memories/abc" or "/movies". */
    link: text("link"),
    /** Null until the user opens / dismisses the notification. */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Arbitrary extra data (media_id, movie_id, family_id, pct, etc.). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_user_read_at_idx").on(table.userId, table.readAt),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_type_idx").on(table.type),
  ],
);

/**
 * Browser Web Push subscriptions (one row per device/browser).
 * Endpoint is unique; re-subscribe upserts keys for the signed-in user.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_uidx").on(table.endpoint),
    index("push_subscriptions_user_id_idx").on(table.userId),
  ],
);

/**
 * Append-only admin action audit trail (support / safety / ops).
 * Prefer `logAdminAudit()` from `@/lib/admin/audit` — never block user flows on failure.
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** e.g. user.suspend, user.plan_change, moderation.review, job.retry */
    action: text("action").notNull(),
    /** e.g. user, media, processing_job */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("admin_audit_logs_created_at_idx").on(table.createdAt),
    index("admin_audit_logs_actor_id_idx").on(table.actorId),
    index("admin_audit_logs_action_idx").on(table.action),
    index("admin_audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);

/**
 * Stripe webhook event dedupe — claim by event.id before handling.
 * Failed handlers delete the row so Stripe retries can re-claim.
 */
export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("stripe_webhook_events_type_idx").on(table.eventType)],
);

/**
 * NL assistant chat threads — one row per conversation for a user.
 */
export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("assistant_conversations_user_id_idx").on(table.userId),
    index("assistant_conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

/**
 * Individual turns within an assistant conversation.
 */
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    role: assistantMessageRoleEnum("role").$type<AssistantMessageRole>().notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata")
      .$type<AssistantMessageMetadata>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("assistant_messages_conversation_id_idx").on(table.conversationId),
    index("assistant_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

/**
 * Side effects spawned from assistant turns (create memory/movie, search, clarify).
 */
export const assistantActions = pgTable(
  "assistant_actions",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => assistantMessages.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionType: assistantActionTypeEnum("action_type")
      .$type<AssistantActionType>()
      .notNull(),
    status: assistantActionStatusEnum("status")
      .$type<AssistantActionStatus>()
      .default("pending")
      .notNull(),
    intent: jsonb("intent").$type<AssistantIntent>(),
    result: jsonb("result").$type<AssistantActionResult>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("assistant_actions_conversation_id_idx").on(table.conversationId),
    index("assistant_actions_user_id_idx").on(table.userId),
    index("assistant_actions_user_created_idx").on(table.userId, table.createdAt),
    index("assistant_actions_message_id_idx").on(table.messageId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Private documents (owner-only — never family-shared)                       */
/* -------------------------------------------------------------------------- */

/**
 * Per-user document folders/categories for Private Documents.
 * Seeded with standard defaults on first access; never appear in family media.
 */
export const documentCategories = pgTable(
  "document_categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_categories_user_slug_uidx").on(
      table.userId,
      table.slug,
    ),
    index("document_categories_user_id_idx").on(table.userId),
    index("document_categories_user_sort_idx").on(
      table.userId,
      table.sortOrder,
    ),
  ],
);

/** Why a private-document reminder exists (single calendar date). */
export const DOCUMENT_REMINDER_KINDS = [
  "renewal",
  "contract_end",
  "expiration",
  "review",
  "other",
] as const;

export const documentReminderKindEnum = pgEnum(
  "document_reminder_kind",
  DOCUMENT_REMINDER_KINDS,
);

/**
 * Owner-only vault files (PDFs, scans, etc.).
 * Strictly scoped by userId — never included in family gallery / shared media.
 */
export const privateDocuments = pgTable(
  "private_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => documentCategories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Freeform private notes (longer than description). */
    notes: text("notes"),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** R2 object key under private-documents/{userId}/… */
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    documentDate: timestamp("document_date", { withTimezone: true }),
    importantFlag: boolean("important_flag").default(false).notNull(),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    /** Null when no reminderAt; otherwise typed purpose of that date. */
    reminderKind: documentReminderKindEnum("reminder_kind"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("private_documents_user_id_idx").on(table.userId),
    index("private_documents_user_category_idx").on(
      table.userId,
      table.categoryId,
    ),
    index("private_documents_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("private_documents_user_important_idx").on(
      table.userId,
      table.importantFlag,
    ),
    index("private_documents_user_reminder_idx").on(
      table.userId,
      table.reminderAt,
    ),
    uniqueIndex("private_documents_storage_key_uidx").on(table.storageKey),
  ],
);

/* -------------------------------------------------------------------------- */
/* Digital Legacy (owner-only — never family-shared)                          */
/* -------------------------------------------------------------------------- */

export const LEGACY_CONTACT_CATEGORIES = [
  "attorney",
  "insurance_agent",
  "accountant",
  "business_partner",
  "family",
  "executor",
  "other",
] as const;

export const LEGACY_INSTRUCTION_SECTION_TYPES = [
  "personal",
  "financial",
  "business_operations",
  "accounts_access",
  "legal",
  "survivors_guidance",
] as const;

export const LEGACY_SECURE_ITEM_TYPES = [
  "password",
  "account_info",
  "location_of_documents",
  "other",
] as const;

export const LEGACY_PLANNING_SENSITIVITIES = [
  "owner_only",
  "emergency_ok",
] as const;

/**
 * Placement sections for Digital Legacy videos.
 * Includes instruction sections plus message / custom placements.
 */
export const LEGACY_VIDEO_SECTION_TYPES = [
  "personal",
  "financial",
  "business_operations",
  "accounts_access",
  "legal",
  "survivors_guidance",
  "message_to_loved_ones",
  "custom",
] as const;

export const LEGACY_VIDEO_SOURCE_TYPES = ["recorded", "uploaded"] as const;

export const legacyContactCategoryEnum = pgEnum(
  "legacy_contact_category",
  LEGACY_CONTACT_CATEGORIES,
);

export const legacyInstructionSectionTypeEnum = pgEnum(
  "legacy_instruction_section_type",
  LEGACY_INSTRUCTION_SECTION_TYPES,
);

export const legacySecureItemTypeEnum = pgEnum(
  "legacy_secure_item_type",
  LEGACY_SECURE_ITEM_TYPES,
);

export const legacyVideoSectionTypeEnum = pgEnum(
  "legacy_video_section_type",
  LEGACY_VIDEO_SECTION_TYPES,
);

export const legacyVideoSourceTypeEnum = pgEnum(
  "legacy_video_source_type",
  LEGACY_VIDEO_SOURCE_TYPES,
);

export const legacyPlanningSensitivityEnum = pgEnum(
  "legacy_planning_sensitivity",
  LEGACY_PLANNING_SENSITIVITIES,
);

/**
 * One profile per user: message to loved ones and high-level preferences.
 * Owner-only — never exposed through family sharing.
 */
export const legacyProfiles = pgTable("legacy_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Summary message to loved ones. */
  summaryMessage: text("summary_message"),
  funeralPreferences: text("funeral_preferences"),
  generalInstructions: text("general_instructions"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Key people to contact (attorney, executor, agents, etc.).
 */
export const legacyContacts = pgTable(
  "legacy_contacts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Role / relationship label (e.g. "Sister", "Estate attorney"). */
    relationship: text("relationship"),
    category: legacyContactCategoryEnum("category").notNull().default("other"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("legacy_contacts_user_id_idx").on(table.userId),
    index("legacy_contacts_user_primary_idx").on(table.userId, table.isPrimary),
    index("legacy_contacts_user_category_idx").on(table.userId, table.category),
  ],
);

/**
 * Structured instruction sections for survivors / fiduciaries.
 */
export const legacyInstructions = pgTable(
  "legacy_instructions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectionType: legacyInstructionSectionTypeEnum("section_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("legacy_instructions_user_id_idx").on(table.userId),
    index("legacy_instructions_user_section_idx").on(
      table.userId,
      table.sectionType,
      table.sortOrder,
    ),
  ],
);

export const legacyInstructionDocuments = pgTable(
  "legacy_instruction_documents",
  {
    instructionId: text("instruction_id")
      .notNull()
      .references(() => legacyInstructions.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => privateDocuments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.instructionId, table.documentId] }),
    index("legacy_instruction_documents_user_idx").on(table.userId),
    index("legacy_instruction_documents_instruction_idx").on(table.instructionId),
    index("legacy_instruction_documents_document_idx").on(table.documentId),
  ],
);

/**
 * Guided Legacy Planning checklist items (owner-only).
 * Attach private documents via legacy_planning_item_documents.
 */
export const legacyPlanningItems = pgTable(
  "legacy_planning_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull(),
    title: text("title").notNull(),
    institution: text("institution"),
    /** Last-four or similar hint — never a full account number. */
    accountHint: text("account_hint"),
    locationHint: text("location_hint"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    sensitivity: legacyPlanningSensitivityEnum("sensitivity")
      .notNull()
      .default("emergency_ok"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("legacy_planning_items_user_id_idx").on(table.userId),
    index("legacy_planning_items_user_category_idx").on(
      table.userId,
      table.categoryId,
      table.sortOrder,
    ),
  ],
);

export const legacyPlanningItemDocuments = pgTable(
  "legacy_planning_item_documents",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => legacyPlanningItems.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => privateDocuments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.documentId] }),
    index("legacy_planning_item_documents_user_idx").on(table.userId),
    index("legacy_planning_item_documents_item_idx").on(table.itemId),
    index("legacy_planning_item_documents_document_idx").on(table.documentId),
  ],
);

/**
 * Sensitive account / password / location notes. Owner-only.
 * Optional link to a private document in the owner's vault.
 */
export const legacySecureItems = pgTable(
  "legacy_secure_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    itemType: legacySecureItemTypeEnum("item_type").notNull().default("other"),
    /** Sensitive freeform text — never family-shared. */
    content: text("content").notNull(),
    relatedDocumentId: text("related_document_id").references(
      () => privateDocuments.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("legacy_secure_items_user_id_idx").on(table.userId),
    index("legacy_secure_items_user_type_idx").on(table.userId, table.itemType),
    index("legacy_secure_items_related_document_idx").on(
      table.relatedDocumentId,
    ),
  ],
);

/**
 * Owner-only videos for Digital Legacy sections.
 * Isolated from family media sharing (separate R2 prefixes + owner filters).
 * Multiple videos per section are allowed via sort_order.
 */
export const legacyVideos = pgTable(
  "legacy_videos",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectionType: legacyVideoSectionTypeEnum("section_type").notNull(),
    /** Optional tie to a specific instruction block in the same section. */
    legacyInstructionId: text("legacy_instruction_id").references(
      () => legacyInstructions.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    durationSeconds: integer("duration_seconds"),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sourceType: legacyVideoSourceTypeEnum("source_type")
      .notNull()
      .default("uploaded"),
    /** Featured message within a section (at most one primary per user+section). */
    isPrimary: boolean("is_primary").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("legacy_videos_user_id_idx").on(table.userId),
    index("legacy_videos_user_section_idx").on(
      table.userId,
      table.sectionType,
      table.sortOrder,
    ),
    index("legacy_videos_user_section_primary_idx").on(
      table.userId,
      table.sectionType,
      table.isPrimary,
    ),
    index("legacy_videos_instruction_idx").on(table.legacyInstructionId),
    uniqueIndex("legacy_videos_storage_key_uidx").on(table.storageKey),
  ],
);

/* -------------------------------------------------------------------------- */
/* Emergency access (Digital Legacy break-glass — NOT family sharing)         */
/* -------------------------------------------------------------------------- */

export const EMERGENCY_ACCESS_STATUSES = [
  "designated",
  "requested",
  "granted",
  "denied",
  "expired",
] as const;

export const emergencyAccessStatusEnum = pgEnum(
  "emergency_access_status",
  EMERGENCY_ACCESS_STATUSES,
);

export const EMERGENCY_ACCESS_TYPES = ["temporary", "permanent"] as const;

export const emergencyAccessTypeEnum = pgEnum(
  "emergency_access_type",
  EMERGENCY_ACCESS_TYPES,
);

/**
 * Trusted emergency contacts who may request break-glass access to an owner's
 * Digital Legacy vault. Separate from family sharing and legacy_contacts.
 */
export const emergencyAccessDesignations = pgTable(
  "emergency_access_designations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Normalized email of the trusted person. */
    designateeEmail: text("designatee_email").notNull(),
    /** Set when the designatee has an app account with a matching email. */
    designateeUserId: text("designatee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    designateeName: text("designatee_name").notNull(),
    relationship: text("relationship"),
    status: emergencyAccessStatusEnum("status").notNull().default("designated"),
    /**
     * temporary = expires after grant_duration_days;
     * permanent = remains until owner revokes (grant_expires_at stays null).
     */
    accessType: emergencyAccessTypeEnum("access_type")
      .notNull()
      .default("temporary"),
    /** 0 = owner must manually approve; otherwise auto-grant after waiting period. */
    waitingPeriodHours: integer("waiting_period_hours").notNull().default(72),
    /** Used when access_type is temporary. Ignored for permanent grants. */
    grantDurationDays: integer("grant_duration_days").notNull().default(30),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    waitingEndsAt: timestamp("waiting_ends_at", { withTimezone: true }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    /** `owner` or `auto` when status is granted. */
    grantedBy: text("granted_by"),
    /** Null only for permanent grants while active; temporary grants always set an expiry. */
    grantExpiresAt: timestamp("grant_expires_at", { withTimezone: true }),
    deniedAt: timestamp("denied_at", { withTimezone: true }),
    denialReason: text("denial_reason"),
    ownerNotes: text("owner_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("emergency_access_owner_user_id_idx").on(table.ownerUserId),
    index("emergency_access_designatee_email_idx").on(table.designateeEmail),
    index("emergency_access_designatee_user_id_idx").on(table.designateeUserId),
    index("emergency_access_owner_status_idx").on(
      table.ownerUserId,
      table.status,
    ),
    index("emergency_access_designatee_status_idx").on(
      table.designateeUserId,
      table.status,
    ),
    uniqueIndex("emergency_access_owner_email_uidx").on(
      table.ownerUserId,
      table.designateeEmail,
    ),
  ],
);

/**
 * Append-only audit log for sensitive private-document and legacy access.
 * Never store document bodies, passwords, or signed URLs in metadata.
 */
export const sensitiveAccessEvents = pgTable(
  "sensitive_access_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sensitive_access_events_user_id_idx").on(table.userId),
    index("sensitive_access_events_action_idx").on(table.action),
    index("sensitive_access_events_target_idx").on(
      table.targetType,
      table.targetId,
    ),
    index("sensitive_access_events_created_idx").on(table.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Connected Accounts (Plaid) — owner-only private vault                        */
/* -------------------------------------------------------------------------- */

export const PLAID_ITEM_STATUSES = [
  "active",
  "error",
  "disconnected",
] as const;
export type PlaidItemStatus = (typeof PLAID_ITEM_STATUSES)[number];

export const plaidItemStatusEnum = pgEnum(
  "plaid_item_status",
  PLAID_ITEM_STATUSES,
);

/** Digital Legacy / Accounts grouping for linked financial accounts. */
export const LINKED_ACCOUNT_CATEGORIES = [
  "banking",
  "investments",
  "loans_debt",
  "credit_cards",
  "insurance_benefits",
  "other",
] as const;
export type LinkedAccountCategoryDb =
  (typeof LINKED_ACCOUNT_CATEGORIES)[number];

export const linkedAccountCategoryEnum = pgEnum(
  "linked_account_category",
  LINKED_ACCOUNT_CATEGORIES,
);

export const MEDIA_CONNECTION_STATUSES = [
  "active",
  "error",
  "disconnected",
] as const;
export type MediaConnectionStatus = (typeof MEDIA_CONNECTION_STATUSES)[number];

export const mediaConnectionStatusEnum = pgEnum(
  "media_connection_status",
  MEDIA_CONNECTION_STATUSES,
);

/**
 * OAuth connections for cloud photo import (Drive, Dropbox, etc.).
 * Owner-only — tokens encrypted; never family-shared or assistant-readable.
 */
export const mediaConnections = pgTable(
  "media_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** google_drive | dropbox | facebook | instagram | tiktok */
    provider: text("provider").notNull(),
    accountLabel: text("account_label"),
    externalAccountId: text("external_account_id"),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: mediaConnectionStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("media_connections_user_provider_account_uidx").on(
      table.userId,
      table.provider,
      table.externalAccountId,
    ),
    index("media_connections_user_id_idx").on(table.userId),
    index("media_connections_user_status_idx").on(table.userId, table.status),
  ],
);

/**
 * Plaid Item = one institution login. Access tokens encrypted at rest.
 * Owner-only — never family-shared.
 */
export const plaidItems = pgTable(
  "plaid_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Plaid item_id from Link / exchange. */
    plaidItemId: text("plaid_item_id").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    /** AES-GCM ciphertext (`v1:…`) — never expose to clients. */
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    status: plaidItemStatusEnum("status").notNull().default("active"),
    products: jsonb("products").$type<string[]>().notNull().default([]),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("plaid_items_plaid_item_id_uidx").on(table.plaidItemId),
    index("plaid_items_user_id_idx").on(table.userId),
    index("plaid_items_user_status_idx").on(table.userId, table.status),
  ],
);

/**
 * Bank / investment accounts under a Plaid item. Balances are snapshots.
 */
export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plaidItemId: text("plaid_item_id")
      .notNull()
      .references(() => plaidItems.id, { onDelete: "cascade" }),
    plaidAccountId: text("plaid_account_id").notNull(),
    name: text("name").notNull(),
    officialName: text("official_name"),
    type: text("type").notNull(),
    subtype: text("subtype"),
    /** Masked account number / last4 from Plaid. */
    mask: text("mask"),
    /** Legacy / Accounts grouping — auto from Plaid, overridable by owner. */
    category: linkedAccountCategoryEnum("category")
      .notNull()
      .default("other"),
    /** When true, sync will not overwrite a manual category choice. */
    categoryManual: boolean("category_manual").notNull().default(false),
    currentBalance: doublePrecision("current_balance"),
    availableBalance: doublePrecision("available_balance"),
    isoCurrencyCode: text("iso_currency_code"),
    /** Owner notes (insurance agent, policy #, etc.) — not from Plaid. */
    notes: text("notes"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("linked_accounts_plaid_account_uidx").on(table.plaidAccountId),
    index("linked_accounts_user_id_idx").on(table.userId),
    index("linked_accounts_item_idx").on(table.plaidItemId),
    index("linked_accounts_user_category_idx").on(table.userId, table.category),
  ],
);

/**
 * Investment holdings snapshot for a linked investment account.
 * Replaced on each successful sync for that account.
 */
export const linkedAccountHoldings = pgTable(
  "linked_account_holdings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedAccountId: text("linked_account_id")
      .notNull()
      .references(() => linkedAccounts.id, { onDelete: "cascade" }),
    plaidSecurityId: text("plaid_security_id"),
    name: text("name").notNull(),
    tickerSymbol: text("ticker_symbol"),
    quantity: doublePrecision("quantity"),
    institutionValue: doublePrecision("institution_value"),
    institutionPrice: doublePrecision("institution_price"),
    isoCurrencyCode: text("iso_currency_code"),
    asOf: timestamp("as_of", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("linked_account_holdings_user_id_idx").on(table.userId),
    index("linked_account_holdings_account_idx").on(table.linkedAccountId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Family Memory Box orders (physical media digitizing)                         */
/* -------------------------------------------------------------------------- */

export const MEMORY_BOX_ORDER_STATUSES = [
  "requested",
  "box_shipped",
  "box_received",
  "processing",
  "completed",
  "cancelled",
] as const;

export type MemoryBoxOrderStatus = (typeof MEMORY_BOX_ORDER_STATUSES)[number];

export const memoryBoxOrderStatusEnum = pgEnum(
  "memory_box_order_status",
  MEMORY_BOX_ORDER_STATUSES,
);

/** Payment state — never imply paid unless Checkout/webhook confirmed it. */
export const MEMORY_BOX_PAYMENT_STATUSES = [
  "unpaid",
  "checkout_pending",
  "paid",
  "manual_follow_up",
] as const;

export type MemoryBoxPaymentStatus =
  (typeof MEMORY_BOX_PAYMENT_STATUSES)[number];

export const memoryBoxPaymentStatusEnum = pgEnum(
  "memory_box_payment_status",
  MEMORY_BOX_PAYMENT_STATUSES,
);

/** Flat digitizing price in USD cents ($199). */
export const MEMORY_BOX_PRICE_CENTS = 19_900;

/** Gamification tracks (photos / memories / family / Digital Legacy). */
export const ACHIEVEMENT_CATEGORIES = [
  "photos",
  "memories",
  "family",
  "legacy",
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const achievementCategoryEnum = pgEnum(
  "achievement_category",
  ACHIEVEMENT_CATEGORIES,
);

export const GAMIFICATION_EVENT_TYPES = [
  "photo_upload",
  "memory_create",
  "invite_sent",
  "invite_accepted",
  "member_first_contribution",
  "legacy_item_added",
] as const;
export type GamificationEventType = (typeof GAMIFICATION_EVENT_TYPES)[number];

/**
 * Customer intake for Family Memory Box digitizing service.
 * Public form submissions; optional link to signed-in user.
 */
export const memoryBoxOrders = pgTable(
  "memory_box_orders",
  {
    id: text("id").primaryKey(),
    /** Set when the submitter was signed in. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("US"),
    estimatedPhotos: integer("estimated_photos").notNull().default(0),
    estimatedVideoTapes: integer("estimated_video_tapes").notNull().default(0),
    estimatedFilmReels: integer("estimated_film_reels").notNull().default(0),
    otherItemsNotes: text("other_items_notes"),
    /** Optional notes / special instructions from the customer. */
    customerNotes: text("customer_notes"),
    /** Customer acknowledged estimates are approximate. */
    estimatesAcknowledged: boolean("estimates_acknowledged").notNull(),
    status: memoryBoxOrderStatusEnum("status").notNull().default("requested"),
    paymentStatus: memoryBoxPaymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),
    /** Quoted flat price in USD cents. */
    priceCents: integer("price_cents")
      .notNull()
      .default(MEMORY_BOX_PRICE_CENTS),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("memory_box_orders_email_idx").on(table.email),
    index("memory_box_orders_status_idx").on(table.status),
    index("memory_box_orders_payment_status_idx").on(table.paymentStatus),
    index("memory_box_orders_created_at_idx").on(table.createdAt),
    index("memory_box_orders_user_id_idx").on(table.userId),
    uniqueIndex("memory_box_orders_stripe_session_uidx").on(
      table.stripeCheckoutSessionId,
    ),
  ],
);

/**
 * Beta Tester NDA clickwrap acceptances (audit trail).
 * Gate checks this table when BETA_NDA_REQUIRED=true.
 */
export const betaNdaAcceptances = pgTable(
  "beta_nda_acceptances",
  {
    id: text("id").primaryKey(),
    /** Clerk user when signed in at acceptance time. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    ndaVersion: text("nda_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("beta_nda_acceptances_user_id_idx").on(table.userId),
    index("beta_nda_acceptances_email_idx").on(table.email),
    index("beta_nda_acceptances_nda_version_idx").on(table.ndaVersion),
    index("beta_nda_acceptances_accepted_at_idx").on(table.acceptedAt),
    uniqueIndex("beta_nda_acceptances_user_version_uidx").on(
      table.userId,
      table.ndaVersion,
    ),
  ],
);

/**
 * Terms of Service clickwrap acceptances (audit trail).
 * Gate checks this table when TERMS_REQUIRED=true.
 */
export const termsAcceptances = pgTable(
  "terms_acceptances",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    termsVersion: text("terms_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("terms_acceptances_user_id_idx").on(table.userId),
    index("terms_acceptances_email_idx").on(table.email),
    index("terms_acceptances_terms_version_idx").on(table.termsVersion),
    index("terms_acceptances_accepted_at_idx").on(table.acceptedAt),
    uniqueIndex("terms_acceptances_user_version_uidx").on(
      table.userId,
      table.termsVersion,
    ),
  ],
);

/**
 * In-app beta feedback submissions (bugs + feature requests).
 * Status workflow: new → triaged → in-progress → resolved.
 */
export const FEEDBACK_SUBMISSION_STATUSES = [
  "new",
  "triaged",
  "in-progress",
  "resolved",
] as const;
export type FeedbackSubmissionStatus =
  (typeof FEEDBACK_SUBMISSION_STATUSES)[number];

export type FeedbackSubmissionContext = {
  url?: string;
  pathname?: string;
  category?: string;
  browser?: string;
  os?: string;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  devicePixelRatio?: number | null;
  userAgent?: string | null;
  timestamp?: string | null;
  consoleErrors?: string[];
  userId?: string | null;
  email?: string | null;
  screenshotKey?: string | null;
  screenshotContentType?: string | null;
};

export const feedbackSubmissions = pgTable(
  "feedback_submissions",
  {
    id: text("id").primaryKey(),
    /** Human-readable reference, e.g. FMV-A1B2C3. */
    ticketId: text("ticket_id").notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    email: text("email"),
    mode: text("mode").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    expectedBehavior: text("expected_behavior"),
    severity: text("severity"),
    problemStatement: text("problem_statement"),
    suggestedSolution: text("suggested_solution"),
    category: text("category").notNull(),
    status: text("status").$type<FeedbackSubmissionStatus>().notNull().default("new"),
    pathname: text("pathname").notNull(),
    pageUrl: text("page_url").notNull(),
    browser: text("browser"),
    os: text("os"),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    devicePixelRatio: doublePrecision("device_pixel_ratio"),
    consoleErrors: jsonb("console_errors")
      .$type<string[]>()
      .default([])
      .notNull(),
    /** Full auto-collected technical context snapshot. */
    context: jsonb("context")
      .$type<FeedbackSubmissionContext>()
      .default({})
      .notNull(),
    userAgent: text("user_agent"),
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }),
    /** R2 key under beta-feedback/ when a screenshot was attached. */
    screenshotKey: text("screenshot_key"),
    screenshotContentType: text("screenshot_content_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("feedback_submissions_ticket_id_uidx").on(table.ticketId),
    index("feedback_submissions_user_id_idx").on(table.userId),
    index("feedback_submissions_mode_idx").on(table.mode),
    index("feedback_submissions_category_idx").on(table.category),
    index("feedback_submissions_status_idx").on(table.status),
    index("feedback_submissions_created_at_idx").on(table.createdAt),
  ],
);

/** @deprecated Use feedbackSubmissions */
export const betaFeedback = feedbackSubmissions;

/**
 * Catalog of unlockable badges. Seeded from ACHIEVEMENT_CATALOG (stable ids).
 */
export const achievementDefinitions = pgTable(
  "achievement_definitions",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: achievementCategoryEnum("category").notNull(),
    /** Count, percent (0–100), or 1 for a boolean legacy category. */
    threshold: integer("threshold").notNull(),
    lpReward: integer("lp_reward").notNull().default(0),
    badgeImage: text("badge_image"),
    /** Optional future feature gate, e.g. cinematic_themes. */
    unlockFeature: text("unlock_feature"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("achievement_definitions_key_uidx").on(table.key),
    index("achievement_definitions_category_idx").on(table.category),
    index("achievement_definitions_sort_order_idx").on(
      table.category,
      table.sortOrder,
    ),
  ],
);

/**
 * One unlock per user + achievement (familyId is context when earned).
 */
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id")
      .notNull()
      .references(() => achievementDefinitions.id, { onDelete: "cascade" }),
    familyId: text("family_id").references(() => families.id, {
      onDelete: "set null",
    }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_achievements_user_achievement_uidx").on(
      table.userId,
      table.achievementId,
    ),
    index("user_achievements_user_id_idx").on(table.userId),
    index("user_achievements_family_id_idx").on(table.familyId),
    index("user_achievements_unlocked_at_idx").on(table.unlockedAt),
  ],
);

/**
 * Per-user vault journey counters + Legacy Points.
 * familyId is the last associated household (not part of the unique key).
 */
export const userProgress = pgTable(
  "user_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: text("family_id").references(() => families.id, {
      onDelete: "set null",
    }),
    photoCount: integer("photo_count").notNull().default(0),
    memoryCount: integer("memory_count").notNull().default(0),
    familyMembersCount: integer("family_members_count").notNull().default(0),
    invitesSentCount: integer("invites_sent_count").notNull().default(0),
    activeCircleCount: integer("active_circle_count").notNull().default(0),
    /** Digital Legacy readiness 0–100. */
    legacyScore: integer("legacy_score").notNull().default(0),
    totalLp: integer("total_lp").notNull().default(0),
    level: integer("level").notNull().default(1),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    streakDays: integer("streak_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_progress_user_id_uidx").on(table.userId),
    index("user_progress_family_id_idx").on(table.familyId),
    index("user_progress_level_idx").on(table.level),
  ],
);

/**
 * Household rollup for a shared vault level.
 */
export const familyProgress = pgTable(
  "family_progress",
  {
    familyId: text("family_id")
      .primaryKey()
      .references(() => families.id, { onDelete: "cascade" }),
    totalPhotos: integer("total_photos").notNull().default(0),
    totalMemories: integer("total_memories").notNull().default(0),
    activeMembers: integer("active_members").notNull().default(0),
    contributingMembers: integer("contributing_members").notNull().default(0),
    averageLegacyScore: integer("average_legacy_score").notNull().default(0),
    vaultLevel: integer("vault_level").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("family_progress_vault_level_idx").on(table.vaultLevel),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  media: many(media),
  memories: many(memories),
  movies: many(movies),
  betaNdaAcceptances: many(betaNdaAcceptances),
  termsAcceptances: many(termsAcceptances),
  betaFeedback: many(feedbackSubmissions),
  feedbackSubmissions: many(feedbackSubmissions),
  people: many(people),
  familyTreeNodes: many(familyTreeNodes),
  familyTreeRelationships: many(familyTreeRelationships),
  faces: many(faces),
  moderationEvents: many(moderationEvents),
  familiesCreated: many(families),
  familyMemberships: many(familyMembers),
  subscriptions: many(subscriptions),
  usageRecords: many(usageRecords),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  adminAuditLogs: many(adminAuditLogs),
  assistantConversations: many(assistantConversations),
  assistantActions: many(assistantActions),
  documentCategories: many(documentCategories),
  privateDocuments: many(privateDocuments),
  legacyProfile: one(legacyProfiles),
  legacyContacts: many(legacyContacts),
  legacyInstructions: many(legacyInstructions),
  legacyInstructionDocuments: many(legacyInstructionDocuments),
  legacySecureItems: many(legacySecureItems),
  emergencyAccessOwned: many(emergencyAccessDesignations, {
    relationName: "emergencyAccessOwner",
  }),
  emergencyAccessReceived: many(emergencyAccessDesignations, {
    relationName: "emergencyAccessDesignatee",
  }),
  sensitiveAccessEvents: many(sensitiveAccessEvents),
  plaidItems: many(plaidItems),
  linkedAccounts: many(linkedAccounts),
  linkedAccountHoldings: many(linkedAccountHoldings),
  mediaConnections: many(mediaConnections),
  userProgress: one(userProgress),
  userAchievements: many(userAchievements),
}));

export const mediaConnectionsRelations = relations(
  mediaConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [mediaConnections.userId],
      references: [users.id],
    }),
  }),
);

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [adminAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const betaNdaAcceptancesRelations = relations(
  betaNdaAcceptances,
  ({ one }) => ({
    user: one(users, {
      fields: [betaNdaAcceptances.userId],
      references: [users.id],
    }),
  }),
);

export const termsAcceptancesRelations = relations(
  termsAcceptances,
  ({ one }) => ({
    user: one(users, {
      fields: [termsAcceptances.userId],
      references: [users.id],
    }),
  }),
);

export const betaFeedbackRelations = relations(feedbackSubmissions, ({ one }) => ({
  user: one(users, {
    fields: [feedbackSubmissions.userId],
    references: [users.id],
  }),
}));

export const feedbackSubmissionsRelations = betaFeedbackRelations;

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [pushSubscriptions.userId],
      references: [users.id],
    }),
  }),
);

export const mediaRelations = relations(media, ({ one, many }) => ({
  user: one(users, {
    fields: [media.userId],
    references: [users.id],
  }),
  memoryLinks: many(memoryMedia),
  faces: many(faces),
  comments: many(mediaComments),
  processingJobs: many(processingJobs),
  moderationEvents: many(moderationEvents),
}));

export const mediaCommentsRelations = relations(mediaComments, ({ one }) => ({
  media: one(media, {
    fields: [mediaComments.mediaId],
    references: [media.id],
  }),
  user: one(users, {
    fields: [mediaComments.userId],
    references: [users.id],
  }),
}));

export const memoriesRelations = relations(memories, ({ one, many }) => ({
  user: one(users, {
    fields: [memories.userId],
    references: [users.id],
  }),
  coverMedia: one(media, {
    fields: [memories.coverMediaId],
    references: [media.id],
  }),
  mediaLinks: many(memoryMedia),
  movies: many(movies),
}));

export const memoryMediaRelations = relations(memoryMedia, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryMedia.memoryId],
    references: [memories.id],
  }),
  media: one(media, {
    fields: [memoryMedia.mediaId],
    references: [media.id],
  }),
}));

export const moviesRelations = relations(movies, ({ one }) => ({
  memory: one(memories, {
    fields: [movies.memoryId],
    references: [memories.id],
  }),
  user: one(users, {
    fields: [movies.userId],
    references: [users.id],
  }),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  user: one(users, {
    fields: [people.userId],
    references: [users.id],
  }),
  coverFace: one(faces, {
    fields: [people.coverFaceId],
    references: [faces.id],
  }),
  faces: many(faces),
  treeNodes: many(familyTreeNodes),
  storyPosts: many(personStoryPosts),
}));

export const personStoryPostsRelations = relations(
  personStoryPosts,
  ({ one }) => ({
    person: one(people, {
      fields: [personStoryPosts.personId],
      references: [people.id],
    }),
    author: one(users, {
      fields: [personStoryPosts.authorUserId],
      references: [users.id],
    }),
  }),
);

export const familyTreeNodesRelations = relations(
  familyTreeNodes,
  ({ one, many }) => ({
    user: one(users, {
      fields: [familyTreeNodes.userId],
      references: [users.id],
    }),
    person: one(people, {
      fields: [familyTreeNodes.personId],
      references: [people.id],
    }),
    relationshipsFrom: many(familyTreeRelationships, {
      relationName: "familyTreeRelFrom",
    }),
    relationshipsTo: many(familyTreeRelationships, {
      relationName: "familyTreeRelTo",
    }),
  }),
);

export const familyTreeRelationshipsRelations = relations(
  familyTreeRelationships,
  ({ one }) => ({
    user: one(users, {
      fields: [familyTreeRelationships.userId],
      references: [users.id],
    }),
    fromNode: one(familyTreeNodes, {
      fields: [familyTreeRelationships.fromNodeId],
      references: [familyTreeNodes.id],
      relationName: "familyTreeRelFrom",
    }),
    toNode: one(familyTreeNodes, {
      fields: [familyTreeRelationships.toNodeId],
      references: [familyTreeNodes.id],
      relationName: "familyTreeRelTo",
    }),
  }),
);

export const facesRelations = relations(faces, ({ one }) => ({
  user: one(users, {
    fields: [faces.userId],
    references: [users.id],
  }),
  media: one(media, {
    fields: [faces.mediaId],
    references: [media.id],
  }),
  person: one(people, {
    fields: [faces.personId],
    references: [people.id],
  }),
}));

export const processingJobsRelations = relations(processingJobs, ({ one }) => ({
  media: one(media, {
    fields: [processingJobs.mediaId],
    references: [media.id],
  }),
}));

export const moderationEventsRelations = relations(
  moderationEvents,
  ({ one }) => ({
    media: one(media, {
      fields: [moderationEvents.mediaId],
      references: [media.id],
    }),
    actor: one(users, {
      fields: [moderationEvents.actorId],
      references: [users.id],
    }),
  }),
);

export const familiesRelations = relations(families, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [families.createdByUserId],
    references: [users.id],
  }),
  members: many(familyMembers),
  chatThreads: many(familyChatThreads),
  chatEligibility: many(familyChatEligibility),
  subscriptions: many(subscriptions),
  usageRecords: many(usageRecords),
  familyProgress: one(familyProgress),
  userProgressRows: many(userProgress),
  userAchievements: many(userAchievements),
}));

export const familyChatThreadsRelations = relations(
  familyChatThreads,
  ({ one, many }) => ({
    family: one(families, {
      fields: [familyChatThreads.familyId],
      references: [families.id],
    }),
    createdBy: one(users, {
      fields: [familyChatThreads.createdByUserId],
      references: [users.id],
    }),
    participants: many(familyChatParticipants),
    messages: many(familyChatMessages),
  }),
);

export const familyChatEligibilityRelations = relations(
  familyChatEligibility,
  ({ one }) => ({
    family: one(families, {
      fields: [familyChatEligibility.familyId],
      references: [families.id],
    }),
    user: one(users, {
      fields: [familyChatEligibility.userId],
      references: [users.id],
    }),
  }),
);

export const familyChatParticipantsRelations = relations(
  familyChatParticipants,
  ({ one }) => ({
    thread: one(familyChatThreads, {
      fields: [familyChatParticipants.threadId],
      references: [familyChatThreads.id],
    }),
    user: one(users, {
      fields: [familyChatParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const familyChatMessagesRelations = relations(
  familyChatMessages,
  ({ one }) => ({
    thread: one(familyChatThreads, {
      fields: [familyChatMessages.threadId],
      references: [familyChatThreads.id],
    }),
    sender: one(users, {
      fields: [familyChatMessages.senderUserId],
      references: [users.id],
    }),
  }),
);

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  family: one(families, {
    fields: [familyMembers.familyId],
    references: [families.id],
  }),
  user: one(users, {
    fields: [familyMembers.userId],
    references: [users.id],
  }),
  invitedBy: one(users, {
    fields: [familyMembers.invitedByUserId],
    references: [users.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  family: one(families, {
    fields: [subscriptions.familyId],
    references: [families.id],
  }),
}));

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  user: one(users, {
    fields: [usageRecords.userId],
    references: [users.id],
  }),
  family: one(families, {
    fields: [usageRecords.familyId],
    references: [families.id],
  }),
}));

export const assistantConversationsRelations = relations(
  assistantConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [assistantConversations.userId],
      references: [users.id],
    }),
    messages: many(assistantMessages),
    actions: many(assistantActions),
  }),
);

export const assistantMessagesRelations = relations(
  assistantMessages,
  ({ one, many }) => ({
    conversation: one(assistantConversations, {
      fields: [assistantMessages.conversationId],
      references: [assistantConversations.id],
    }),
    actions: many(assistantActions),
  }),
);

export const assistantActionsRelations = relations(
  assistantActions,
  ({ one }) => ({
    conversation: one(assistantConversations, {
      fields: [assistantActions.conversationId],
      references: [assistantConversations.id],
    }),
    message: one(assistantMessages, {
      fields: [assistantActions.messageId],
      references: [assistantMessages.id],
    }),
    user: one(users, {
      fields: [assistantActions.userId],
      references: [users.id],
    }),
  }),
);

export const documentCategoriesRelations = relations(
  documentCategories,
  ({ one, many }) => ({
    user: one(users, {
      fields: [documentCategories.userId],
      references: [users.id],
    }),
    documents: many(privateDocuments),
  }),
);

export const privateDocumentsRelations = relations(
  privateDocuments,
  ({ one, many }) => ({
    user: one(users, {
      fields: [privateDocuments.userId],
      references: [users.id],
    }),
    category: one(documentCategories, {
      fields: [privateDocuments.categoryId],
      references: [documentCategories.id],
    }),
    legacySecureItems: many(legacySecureItems),
  }),
);

export const legacyProfilesRelations = relations(legacyProfiles, ({ one }) => ({
  user: one(users, {
    fields: [legacyProfiles.userId],
    references: [users.id],
  }),
}));

export const legacyContactsRelations = relations(legacyContacts, ({ one }) => ({
  user: one(users, {
    fields: [legacyContacts.userId],
    references: [users.id],
  }),
}));

export const legacyInstructionsRelations = relations(
  legacyInstructions,
  ({ many, one }) => ({
    user: one(users, {
      fields: [legacyInstructions.userId],
      references: [users.id],
    }),
    attachedDocuments: many(legacyInstructionDocuments),
  }),
);

export const legacyInstructionDocumentsRelations = relations(
  legacyInstructionDocuments,
  ({ one }) => ({
    instruction: one(legacyInstructions, {
      fields: [legacyInstructionDocuments.instructionId],
      references: [legacyInstructions.id],
    }),
    document: one(privateDocuments, {
      fields: [legacyInstructionDocuments.documentId],
      references: [privateDocuments.id],
    }),
    user: one(users, {
      fields: [legacyInstructionDocuments.userId],
      references: [users.id],
    }),
  }),
);

export const legacySecureItemsRelations = relations(
  legacySecureItems,
  ({ one }) => ({
    user: one(users, {
      fields: [legacySecureItems.userId],
      references: [users.id],
    }),
    relatedDocument: one(privateDocuments, {
      fields: [legacySecureItems.relatedDocumentId],
      references: [privateDocuments.id],
    }),
  }),
);

export const emergencyAccessDesignationsRelations = relations(
  emergencyAccessDesignations,
  ({ one }) => ({
    owner: one(users, {
      fields: [emergencyAccessDesignations.ownerUserId],
      references: [users.id],
      relationName: "emergencyAccessOwner",
    }),
    designatee: one(users, {
      fields: [emergencyAccessDesignations.designateeUserId],
      references: [users.id],
      relationName: "emergencyAccessDesignatee",
    }),
  }),
);

export const plaidItemsRelations = relations(plaidItems, ({ one, many }) => ({
  user: one(users, {
    fields: [plaidItems.userId],
    references: [users.id],
  }),
  accounts: many(linkedAccounts),
}));

export const linkedAccountsRelations = relations(
  linkedAccounts,
  ({ one, many }) => ({
    user: one(users, {
      fields: [linkedAccounts.userId],
      references: [users.id],
    }),
    item: one(plaidItems, {
      fields: [linkedAccounts.plaidItemId],
      references: [plaidItems.id],
    }),
    holdings: many(linkedAccountHoldings),
  }),
);

export const linkedAccountHoldingsRelations = relations(
  linkedAccountHoldings,
  ({ one }) => ({
    user: one(users, {
      fields: [linkedAccountHoldings.userId],
      references: [users.id],
    }),
    account: one(linkedAccounts, {
      fields: [linkedAccountHoldings.linkedAccountId],
      references: [linkedAccounts.id],
    }),
  }),
);

export const achievementDefinitionsRelations = relations(
  achievementDefinitions,
  ({ many }) => ({
    unlocks: many(userAchievements),
  }),
);

export const userAchievementsRelations = relations(
  userAchievements,
  ({ one }) => ({
    user: one(users, {
      fields: [userAchievements.userId],
      references: [users.id],
    }),
    achievement: one(achievementDefinitions, {
      fields: [userAchievements.achievementId],
      references: [achievementDefinitions.id],
    }),
    family: one(families, {
      fields: [userAchievements.familyId],
      references: [families.id],
    }),
  }),
);

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  user: one(users, {
    fields: [userProgress.userId],
    references: [users.id],
  }),
  family: one(families, {
    fields: [userProgress.familyId],
    references: [families.id],
  }),
}));

export const familyProgressRelations = relations(familyProgress, ({ one }) => ({
  family: one(families, {
    fields: [familyProgress.familyId],
    references: [families.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type MediaComment = typeof mediaComments.$inferSelect;
export type NewMediaComment = typeof mediaComments.$inferInsert;
export type MediaConnection = typeof mediaConnections.$inferSelect;
export type NewMediaConnection = typeof mediaConnections.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type MemoryMedia = typeof memoryMedia.$inferSelect;
export type NewMemoryMedia = typeof memoryMedia.$inferInsert;
export type Movie = typeof movies.$inferSelect;
export type NewMovie = typeof movies.$inferInsert;
export type MovieShare = typeof movieShares.$inferSelect;
export type NewMovieShare = typeof movieShares.$inferInsert;
export type PhotoRequest = typeof photoRequests.$inferSelect;
export type NewPhotoRequest = typeof photoRequests.$inferInsert;
export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type PersonStoryPost = typeof personStoryPosts.$inferSelect;
export type NewPersonStoryPost = typeof personStoryPosts.$inferInsert;
export type FamilyTreeNode = typeof familyTreeNodes.$inferSelect;
export type NewFamilyTreeNode = typeof familyTreeNodes.$inferInsert;
export type FamilyTreeRelationship = typeof familyTreeRelationships.$inferSelect;
export type NewFamilyTreeRelationship = typeof familyTreeRelationships.$inferInsert;
export type Face = typeof faces.$inferSelect;
export type NewFace = typeof faces.$inferInsert;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;
export type ModerationEvent = typeof moderationEvents.$inferSelect;
export type NewModerationEvent = typeof moderationEvents.$inferInsert;
export type Family = typeof families.$inferSelect;
export type NewFamily = typeof families.$inferInsert;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type NewFamilyMember = typeof familyMembers.$inferInsert;
export type FamilyChatThread = typeof familyChatThreads.$inferSelect;
export type NewFamilyChatThread = typeof familyChatThreads.$inferInsert;
export type FamilyChatEligibility = typeof familyChatEligibility.$inferSelect;
export type NewFamilyChatEligibility = typeof familyChatEligibility.$inferInsert;
export type FamilyChatParticipant = typeof familyChatParticipants.$inferSelect;
export type NewFamilyChatParticipant = typeof familyChatParticipants.$inferInsert;
export type FamilyChatMessage = typeof familyChatMessages.$inferSelect;
export type NewFamilyChatMessage = typeof familyChatMessages.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;
export type AssistantConversationRow =
  typeof assistantConversations.$inferSelect;
export type NewAssistantConversation =
  typeof assistantConversations.$inferInsert;
export type AssistantMessageRow = typeof assistantMessages.$inferSelect;
export type NewAssistantMessage = typeof assistantMessages.$inferInsert;
export type AssistantActionRow = typeof assistantActions.$inferSelect;
export type NewAssistantAction = typeof assistantActions.$inferInsert;
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type NewDocumentCategory = typeof documentCategories.$inferInsert;
export type PrivateDocument = typeof privateDocuments.$inferSelect;
export type NewPrivateDocument = typeof privateDocuments.$inferInsert;
export type LegacyProfile = typeof legacyProfiles.$inferSelect;
export type NewLegacyProfile = typeof legacyProfiles.$inferInsert;
export type LegacyContact = typeof legacyContacts.$inferSelect;
export type NewLegacyContact = typeof legacyContacts.$inferInsert;
export type LegacyInstruction = typeof legacyInstructions.$inferSelect;
export type NewLegacyInstruction = typeof legacyInstructions.$inferInsert;
export type LegacyInstructionDocument =
  typeof legacyInstructionDocuments.$inferSelect;
export type NewLegacyInstructionDocument =
  typeof legacyInstructionDocuments.$inferInsert;
export type LegacyPlanningItem = typeof legacyPlanningItems.$inferSelect;
export type NewLegacyPlanningItem = typeof legacyPlanningItems.$inferInsert;
export type LegacyPlanningItemDocument =
  typeof legacyPlanningItemDocuments.$inferSelect;
export type NewLegacyPlanningItemDocument =
  typeof legacyPlanningItemDocuments.$inferInsert;
export type LegacySecureItem = typeof legacySecureItems.$inferSelect;
export type NewLegacySecureItem = typeof legacySecureItems.$inferInsert;
export type LegacyVideo = typeof legacyVideos.$inferSelect;
export type NewLegacyVideo = typeof legacyVideos.$inferInsert;
export type EmergencyAccessDesignation =
  typeof emergencyAccessDesignations.$inferSelect;
export type NewEmergencyAccessDesignation =
  typeof emergencyAccessDesignations.$inferInsert;
export type SensitiveAccessEvent = typeof sensitiveAccessEvents.$inferSelect;
export type NewSensitiveAccessEvent = typeof sensitiveAccessEvents.$inferInsert;
export type PlaidItem = typeof plaidItems.$inferSelect;
export type NewPlaidItem = typeof plaidItems.$inferInsert;
export type LinkedAccount = typeof linkedAccounts.$inferSelect;
export type NewLinkedAccount = typeof linkedAccounts.$inferInsert;
export type LinkedAccountHolding = typeof linkedAccountHoldings.$inferSelect;
export type NewLinkedAccountHolding = typeof linkedAccountHoldings.$inferInsert;
export type MemoryBoxOrder = typeof memoryBoxOrders.$inferSelect;
export type NewMemoryBoxOrder = typeof memoryBoxOrders.$inferInsert;
export type BetaNdaAcceptance = typeof betaNdaAcceptances.$inferSelect;
export type NewBetaNdaAcceptance = typeof betaNdaAcceptances.$inferInsert;
export type TermsAcceptance = typeof termsAcceptances.$inferSelect;
export type NewTermsAcceptance = typeof termsAcceptances.$inferInsert;
export type BetaFeedback = typeof feedbackSubmissions.$inferSelect;
export type NewBetaFeedback = typeof feedbackSubmissions.$inferInsert;
export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbackSubmissions.$inferInsert;
export type AchievementDefinition = typeof achievementDefinitions.$inferSelect;
export type NewAchievementDefinition = typeof achievementDefinitions.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type UserProgress = typeof userProgress.$inferSelect;
export type NewUserProgress = typeof userProgress.$inferInsert;
export type FamilyProgress = typeof familyProgress.$inferSelect;
export type NewFamilyProgress = typeof familyProgress.$inferInsert;

/** @deprecated Use ProcessingJob — kept for queue helper compatibility */
export type QueueJob = ProcessingJob;
export type NewQueueJob = NewProcessingJob;
