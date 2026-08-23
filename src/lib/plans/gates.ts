/**
 * Plan limit gates — boolean-friendly checks shared by APIs and UI.
 *
 * Prefer these over scattering quota logic in route handlers.
 */

import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  families,
  familyMembers,
  movies,
  people,
  processingJobs,
  type PlanFeatures,
} from "@/lib/db/schema";
import type { PlanLimits } from "@/lib/plans";
import { shouldApplyMovieWatermark } from "@/lib/movies/watermark";

export type PlanGateCode =
  | "movie_quota"
  | "movie_daily_quota"
  | "movie_active_jobs"
  | "family_sharing_disabled"
  | "family_member_limit"
  | "theme_locked"
  | "face_detection_disabled"
  | "people_limit"
  | "ai_soundtrack_disabled"
  | "ai_soundtrack_quota"
  | "ai_soundtrack_unavailable"
  | "legacy_plus_required";

export type PlanGateResult = {
  allowed: boolean;
  code?: PlanGateCode;
  reason?: string;
  /** Short upgrade CTA copy for banners. */
  upgradeHint?: string;
  used?: number;
  limit?: number | null;
  planName: string;
  planSlug: string;
  limits: PlanLimits;
};

/** Themes that require `features.cinematicThemes`. */
export const ADVANCED_MOVIE_THEMES = ["cinematic", "vintage"] as const;
export type AdvancedMovieTheme = (typeof ADVANCED_MOVIE_THEMES)[number];

export function isAdvancedMovieTheme(
  style: string | null | undefined,
): style is AdvancedMovieTheme {
  return Boolean(
    style && (ADVANCED_MOVIE_THEMES as readonly string[]).includes(style),
  );
}

async function loadLimits(userId: string): Promise<PlanLimits> {
  // Dynamic import avoids circular deps with `@/lib/plans` barrel.
  const { getUserPlanLimits } = await import("@/lib/plans/index");
  return getUserPlanLimits(userId);
}

function allowed(limits: PlanLimits): PlanGateResult {
  return {
    allowed: true,
    planName: limits.name,
    planSlug: String(limits.slug),
    limits,
  };
}

function denied(
  limits: PlanLimits,
  code: PlanGateCode,
  reason: string,
  extra?: Partial<PlanGateResult>,
): PlanGateResult {
  return {
    allowed: false,
    code,
    reason,
    upgradeHint: extra?.upgradeHint ?? "Upgrade your plan to unlock this.",
    used: extra?.used,
    limit: extra?.limit,
    planName: limits.name,
    planSlug: String(limits.slug),
    limits,
  };
}

function featureFlag(
  features: PlanFeatures,
  key: keyof PlanFeatures,
): boolean {
  return Boolean(features?.[key]);
}

function maxPeopleFromFeatures(features: PlanFeatures): number | null {
  const raw = features?.maxPeople;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function maxAiSoundtracksFromFeatures(features: PlanFeatures): number {
  if (!featureFlag(features, "aiSoundtrack")) return 0;
  const raw = features?.maxAiSoundtracksPerMonth;
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfUtcMonthLocal(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function movieDailyLimit(): number {
  const raw = Number(process.env.MOVIE_DAILY_LIMIT ?? 10);
  if (!Number.isFinite(raw) || raw < 1) return 10;
  return Math.min(Math.floor(raw), 100);
}

/** Align with assertWithinMovieActiveJobLimit — plan cap and env ceiling. */
function movieActiveJobLimit(planLimit: number): number {
  const plan = Math.max(1, planLimit);
  const raw = Number(process.env.MOVIE_ACTIVE_JOB_LIMIT ?? 3);
  const envCeiling =
    !Number.isFinite(raw) || raw < 1 ? 3 : Math.min(Math.floor(raw), 20);
  return Math.min(plan, envCeiling);
}

async function moviesCreatedThisMonth(userId: string): Promise<number> {
  const db = getDb();
  const since = startOfUtcMonthLocal();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(movies)
    .where(and(eq(movies.userId, userId), gte(movies.createdAt, since)));
  return Number(row?.value ?? 0);
}

async function moviesCreatedToday(userId: string): Promise<number> {
  const db = getDb();
  const since = startOfUtcDay();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(movies)
    .where(and(eq(movies.userId, userId), gte(movies.createdAt, since)));
  return Number(row?.value ?? 0);
}

async function activeMovieJobs(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.type, "movie.render"),
        inArray(processingJobs.status, ["pending", "processing"]),
        sql`(${processingJobs.payload}->>'userId') = ${userId}`,
      ),
    );
  return Number(row?.value ?? 0);
}

/**
 * Whether the user may start another movie this month (and pass soft daily /
 * concurrency guards). Does not create a job.
 */
export async function canCreateMovie(userId: string): Promise<PlanGateResult> {
  const limits = await loadLimits(userId);
  const monthlyLimit = Math.max(0, limits.maxMoviesPerMonth);
  const monthlyUsed = await moviesCreatedThisMonth(userId);

  if (monthlyUsed >= monthlyLimit) {
    return denied(
      limits,
      "movie_quota",
      `You've used all ${monthlyLimit} movies this month on ${limits.name}. They reset next month, or you can upgrade for more.`,
      {
        used: monthlyUsed,
        limit: monthlyLimit,
        upgradeHint: "Upgrade for more movies each month.",
      },
    );
  }

  const dailyLimit = movieDailyLimit();
  const dailyUsed = await moviesCreatedToday(userId);
  if (dailyUsed >= dailyLimit) {
    return denied(
      limits,
      "movie_daily_quota",
      `You've hit today's movie burst limit (${dailyLimit}). Try again tomorrow.`,
      {
        used: dailyUsed,
        limit: dailyLimit,
        upgradeHint:
          "Daily burst limit — try again tomorrow, or upgrade for higher monthly caps.",
      },
    );
  }

  const activeLimit = movieActiveJobLimit(limits.maxActiveMovieJobs);
  const active = await activeMovieJobs(userId);
  if (active >= activeLimit) {
    return denied(
      limits,
      "movie_active_jobs",
      `You already have ${active} movie${active === 1 ? "" : "s"} rendering. Wait for one to finish, then try again.`,
      {
        used: active,
        limit: activeLimit,
        upgradeHint:
          "Wait for a render to finish, or upgrade for more concurrent movies.",
      },
    );
  }

  return {
    ...allowed(limits),
    used: monthlyUsed,
    limit: monthlyLimit,
  };
}

/**
 * Whether a style/theme is allowed on the user's plan.
 * Pass no style to check if advanced themes are unlocked at all.
 */
export async function canUseAdvancedTheme(
  userId: string,
  style?: string | null,
): Promise<PlanGateResult> {
  const limits = await loadLimits(userId);
  const unlocked = featureFlag(limits.features, "cinematicThemes");

  if (!style) {
    if (!unlocked) {
      return denied(
        limits,
        "theme_locked",
        `Cinematic themes are not included on the ${limits.name} plan.`,
        {
          upgradeHint: "Upgrade to Family to unlock cinematic movie themes.",
        },
      );
    }
    return allowed(limits);
  }

  if (!isAdvancedMovieTheme(style)) {
    return allowed(limits);
  }

  if (!unlocked) {
    return denied(
      limits,
      "theme_locked",
      `The ${style} theme requires a Family plan or higher.`,
      { upgradeHint: "Upgrade to unlock cinematic and advanced themes." },
    );
  }

  return allowed(limits);
}

/**
 * Count active + pending seats (pending invites reserve a member slot).
 */
export async function countFamilyMemberSeats(
  familyId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        inArray(familyMembers.status, ["active", "pending"]),
      ),
    );
  return Number(row?.value ?? 0);
}

/**
 * Whether the family can accept another invite.
 * Pass `reusingSeat: true` when refreshing an existing pending invite.
 */
export async function canInviteMember(
  familyId: string,
  opts?: { reusingSeat?: boolean; billingUserId?: string },
): Promise<PlanGateResult> {
  const db = getDb();
  const [family] = await db
    .select()
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1);

  if (!family) {
    throw new PlanGateError("Family not found.", {
      allowed: false,
      code: "family_sharing_disabled",
      reason: "Family not found.",
      planName: "Unknown",
      planSlug: "unknown",
      limits: {
        slug: "unknown",
        name: "Unknown",
        storageLimitBytes: null,
        maxFamilyMembers: 0,
        maxMoviesPerMonth: 0,
        maxActiveMovieJobs: 0,
        features: {
          familySharing: false,
          faceDetection: false,
          cinematicThemes: false,
          priorityRender: false,
          aiSoundtrack: false,
          maxAiSoundtracksPerMonth: 0,
        },
      },
    });
  }

  const billingUserId = opts?.billingUserId ?? family.createdByUserId;
  const limits = await loadLimits(billingUserId);

  if (!featureFlag(limits.features, "familySharing")) {
    return denied(
      limits,
      "family_sharing_disabled",
      `Family sharing is not included on the ${limits.name} plan.`,
      {
        upgradeHint: "Upgrade to Family to invite relatives to your vault.",
        limit: limits.maxFamilyMembers,
        used: await countFamilyMemberSeats(familyId),
      },
    );
  }

  if (opts?.reusingSeat) {
    return {
      ...allowed(limits),
      used: await countFamilyMemberSeats(familyId),
      limit: limits.maxFamilyMembers,
    };
  }

  const used = await countFamilyMemberSeats(familyId);
  const limit = Math.max(1, limits.maxFamilyMembers);
  if (used >= limit) {
    return denied(
      limits,
      "family_member_limit",
      `This family is full (${used}/${limit} members on ${limits.name}).`,
      {
        used,
        limit,
        upgradeHint: "Upgrade for more family member seats.",
      },
    );
  }

  return { ...allowed(limits), used, limit };
}

/**
 * Whether the user may create a household (requires familySharing).
 */
export async function canCreateFamily(userId: string): Promise<PlanGateResult> {
  const limits = await loadLimits(userId);
  if (!featureFlag(limits.features, "familySharing")) {
    return denied(
      limits,
      "family_sharing_disabled",
      `Creating a shared family requires the Family plan or higher.`,
      {
        upgradeHint: "Upgrade to Family to invite people you trust.",
        limit: limits.maxFamilyMembers,
      },
    );
  }
  return allowed(limits);
}

export async function canUseFaceDetection(
  userId: string,
): Promise<PlanGateResult> {
  const limits = await loadLimits(userId);
  if (!featureFlag(limits.features, "faceDetection")) {
    return denied(
      limits,
      "face_detection_disabled",
      `Face detection is not included on the ${limits.name} plan.`,
      { upgradeHint: "Upgrade to enable People & face grouping." },
    );
  }
  return allowed(limits);
}

export async function countUserPeople(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(people)
    .where(eq(people.userId, userId));
  return Number(row?.value ?? 0);
}

/**
 * Whether the user may create another People identity.
 */
export async function canCreatePerson(userId: string): Promise<PlanGateResult> {
  const faceGate = await canUseFaceDetection(userId);
  if (!faceGate.allowed) return faceGate;

  const { limits } = faceGate;
  const maxPeople = maxPeopleFromFeatures(limits.features);
  const used = await countUserPeople(userId);

  if (maxPeople != null && used >= maxPeople) {
    return denied(
      limits,
      "people_limit",
      `People limit reached (${used}/${maxPeople} on ${limits.name}).`,
      {
        used,
        limit: maxPeople,
        upgradeHint: "Upgrade for more People identities in your vault.",
      },
    );
  }

  return { ...allowed(limits), used, limit: maxPeople };
}

/**
 * Count completed AI soundtrack generations this UTC month for a user.
 */
export async function countAiSoundtracksThisMonth(
  userId: string,
): Promise<number> {
  const db = getDb();
  const since = startOfUtcMonthLocal();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.type, "movie.ai_soundtrack"),
        eq(processingJobs.status, "completed"),
        gte(processingJobs.createdAt, since),
        sql`(${processingJobs.payload}->>'userId') = ${userId}`,
      ),
    );
  return Number(row?.value ?? 0);
}

/**
 * Whether the user may start an AI soundtrack generation (plan + monthly cap).
 * Provider availability is checked separately by the API when starting a job.
 */
export async function canGenerateAiSoundtrack(
  userId: string,
): Promise<PlanGateResult> {
  const limits = await loadLimits(userId);
  const unlocked = featureFlag(limits.features, "aiSoundtrack");
  const monthlyLimit = maxAiSoundtracksFromFeatures(limits.features);

  if (!unlocked || monthlyLimit < 1) {
    return denied(
      limits,
      "ai_soundtrack_disabled",
      `AI soundtrack generation is not included on the ${limits.name} plan.`,
      {
        used: 0,
        limit: 0,
        upgradeHint: "Upgrade to Family to generate AI soundtracks for movies.",
      },
    );
  }

  const used = await countAiSoundtracksThisMonth(userId);
  if (used >= monthlyLimit) {
    return denied(
      limits,
      "ai_soundtrack_quota",
      `You've used all ${monthlyLimit} AI soundtracks this month on ${limits.name}.`,
      {
        used,
        limit: monthlyLimit,
        upgradeHint: "Upgrade for more AI soundtrack generations each month.",
      },
    );
  }

  return { ...allowed(limits), used, limit: monthlyLimit };
}

/**
 * Legacy+ tools: Private Documents, Digital Legacy, Connected Accounts.
 * Catalog sets `features.legacy` (and related flags) on the Legacy+ plan only.
 */
export function hasLegacyPlusFeatures(features: PlanFeatures): boolean {
  return (
    featureFlag(features, "legacy") ||
    featureFlag(features, "privateDocuments") ||
    featureFlag(features, "digitalLegacy") ||
    featureFlag(features, "connectedAccounts")
  );
}

export async function canUseLegacyPlusFeatures(
  userId: string,
): Promise<PlanGateResult> {
  const limits = await loadLimits(userId);
  if (!hasLegacyPlusFeatures(limits.features)) {
    return denied(
      limits,
      "legacy_plus_required",
      `Private Documents, Digital Legacy, and Connected Accounts are included on Legacy+ — not on ${limits.name}.`,
      {
        upgradeHint:
          "Switch to the Legacy+ plan (free during beta) to unlock these vaults.",
      },
    );
  }
  return allowed(limits);
}

/**
 * Snapshot for UI (movie panel, family settings, etc.).
 */
export type PlanCapabilities = {
  planName: string;
  planSlug: string;
  movies: PlanGateResult;
  advancedThemes: boolean;
  familySharing: boolean;
  maxFamilyMembers: number;
  maxMoviesPerMonth: number;
  maxPeople: number | null;
  faceDetection: boolean;
  priorityRender: boolean;
  aiSoundtrack: boolean;
  aiSoundtracks: PlanGateResult;
  legacyPlus: boolean;
  /** Free-plan soft branding watermark on rendered movies. */
  movieWatermark: boolean;
};

export async function getPlanCapabilities(
  userId: string,
): Promise<PlanCapabilities> {
  const limits = await loadLimits(userId);
  const movies = await canCreateMovie(userId);
  const aiSoundtracks = await canGenerateAiSoundtrack(userId);
  return {
    planName: limits.name,
    planSlug: String(limits.slug),
    movies,
    advancedThemes: featureFlag(limits.features, "cinematicThemes"),
    familySharing: featureFlag(limits.features, "familySharing"),
    maxFamilyMembers: limits.maxFamilyMembers,
    maxMoviesPerMonth: limits.maxMoviesPerMonth,
    maxPeople: maxPeopleFromFeatures(limits.features),
    faceDetection: featureFlag(limits.features, "faceDetection"),
    priorityRender: featureFlag(limits.features, "priorityRender"),
    aiSoundtrack: featureFlag(limits.features, "aiSoundtrack"),
    aiSoundtracks,
    legacyPlus: hasLegacyPlusFeatures(limits.features),
    movieWatermark: shouldApplyMovieWatermark(
      String(limits.slug),
      limits.features,
    ),
  };
}

export class PlanGateError extends Error {
  readonly code: PlanGateCode;
  readonly gate: PlanGateResult;

  constructor(message: string, gate: PlanGateResult) {
    super(message);
    this.name = "PlanGateError";
    this.code = gate.code ?? "movie_quota";
    this.gate = gate;
  }
}

export function assertGateAllowed(result: PlanGateResult): void {
  if (result.allowed) return;
  throw new PlanGateError(
    result.reason ?? "This action is not allowed on your plan.",
    result,
  );
}
