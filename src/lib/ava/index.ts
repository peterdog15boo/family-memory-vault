/**
 * Ava — guided new-user helper.
 *
 * Durable state lives on users.onboarding (jsonb). Task completion is mostly
 * derived from live vault signals so progress stays honest across sessions.
 */

import { and, count, desc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  assistantConversations,
  familyMembers,
  media,
  memories,
  movies,
  people,
  users,
  type AvaHelperProgress,
  type UserOnboardingState,
} from "@/lib/db/schema";
import { getDownloadUrl } from "@/lib/r2";
import { cleanReadyMediaFilter } from "@/lib/media/queries";
import { isR2Configured } from "@/lib/upload/constants";
import type {
  AvaAutoOpenReason,
  AvaProgress,
  AvaSignals,
  AvaStep,
  AvaStepId,
  AvaStepStatus,
} from "@/lib/ava/types";
import {
  isAvaAvatarPresetUrl,
  resolveAvaAvatarUrl,
  validateAvaAvatarDataUrl,
  validateAvaScreenName,
} from "@/lib/ava/setup";
import { normalizeOnboardingState } from "@/lib/ava/onboarding-state";
import {
  isRealAvatarUrl,
  isRealDisplayName,
  saveProfileAvatar,
  saveProfileDisplayName,
} from "@/lib/profile";
import { getAccountPreferences } from "@/lib/account-preferences";
import {
  createTranslator,
  DEFAULT_LOCALE,
  isAppLocale,
  type TranslateFn,
} from "@/lib/i18n";

export type {
  AvaAutoOpenReason,
  AvaProgress,
  AvaSignals,
  AvaStep,
  AvaStepId,
  AvaStepStatus,
} from "@/lib/ava/types";

export { normalizeOnboardingState } from "@/lib/ava/onboarding-state";

export {
  // Test / debug helpers for first-run identity gating.
  hasLiveScreenName as avaHasRealScreenName,
  hasLiveAvatar as avaHasAvatarSet,
  identitySetupComplete as avaIdentitySetupComplete,
  buildSteps as avaBuildSteps,
};

const CORE_DONE_IDS: AvaStepId[] = [
  "welcome",
  "screen_name",
  "avatar",
  "upload",
  "create_memory",
];

function emptyProgress(): AvaHelperProgress {
  return {};
}

async function countPendingModeration(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(
      and(
        eq(media.userId, userId),
        or(
          eq(media.status, "pending_moderation"),
          eq(media.moderationStatus, "pending"),
        ),
      ),
    );
  return Number(row?.value ?? 0);
}

async function countCleanPhotos(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(and(cleanReadyMediaFilter(userId), eq(media.type, "photo")));
  return Number(row?.value ?? 0);
}

async function countAnyMedia(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(eq(media.userId, userId));
  return Number(row?.value ?? 0);
}

async function countMemories(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(memories)
    .where(eq(memories.userId, userId));
  return Number(row?.value ?? 0);
}

async function getLatestMemoryId(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(1);
  return row?.id ?? null;
}

async function countPeople(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(people)
    .where(eq(people.userId, userId));
  return Number(row?.value ?? 0);
}

async function countMovies(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(movies)
    .where(eq(movies.userId, userId));
  return Number(row?.value ?? 0);
}

async function countInvitesSent(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.invitedByUserId, userId),
        or(
          sql`${familyMembers.userId} is null`,
          ne(familyMembers.userId, userId),
        ),
      ),
    );
  return Number(row?.value ?? 0);
}

async function countAssistantConversations(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(assistantConversations)
    .where(eq(assistantConversations.userId, userId));
  return Number(row?.value ?? 0);
}

async function resolveAvatarPreview(
  userId: string,
  state: UserOnboardingState,
  clerkImageUrl: string | null,
): Promise<string | null> {
  if (state.avatarUrl) return state.avatarUrl;
  if (state.avatarMediaId && isR2Configured()) {
    const db = getDb();
    const [row] = await db
      .select({
        originalKey: media.originalKey,
        processedKey: media.processedKey,
        thumbnailKey: media.thumbnailKey,
        moderationStatus: media.moderationStatus,
        status: media.status,
        type: media.type,
      })
      .from(media)
      .where(and(eq(media.id, state.avatarMediaId), eq(media.userId, userId)))
      .limit(1);
    if (
      row &&
      row.moderationStatus === "clean" &&
      row.status === "ready"
    ) {
      try {
        const key =
          row.thumbnailKey ||
          (row.type === "photo" ? row.processedKey || row.originalKey : null);
        if (key) {
          const signed = await getDownloadUrl(key, undefined, {
            moderationStatus: "clean",
            mediaStatus: row.status,
          });
          return signed.url;
        }
      } catch {
        /* fall through */
      }
    }
  }
  return clerkImageUrl;
}

/**
 * Live profile completeness (same fields Settings reads via users table /
 * Clerk-synced displayName + imageUrl).
 */
function hasLiveScreenName(displayName: string | null | undefined): boolean {
  return isRealDisplayName(displayName);
}

function hasLiveAvatar(imageUrl: string | null | undefined): boolean {
  return isRealAvatarUrl(imageUrl);
}

function identitySetupComplete(
  _state: UserOnboardingState,
  signals: AvaSignals,
): boolean {
  return (
    hasLiveScreenName(signals.displayName) &&
    hasLiveAvatar(signals.imageUrl)
  );
}

/** Kept for tests / greetings that still inspect onboarding.screenName. */
function hasAvaScreenName(state: UserOnboardingState): boolean {
  return Boolean(state.screenName?.trim());
}

function hasAvaAvatar(state: UserOnboardingState): boolean {
  const hp = state.helperProgress;
  if (hp?.avatarSkipped === true) return true;
  return Boolean(state.avatarMediaId || state.avatarUrl?.trim());
}

function hasRealScreenName(
  state: UserOnboardingState,
  displayName: string | null,
): boolean {
  if (hasLiveScreenName(displayName)) return true;
  return hasAvaScreenName(state);
}

function hasAvatarSet(
  _state: UserOnboardingState,
  signals: AvaSignals,
): boolean {
  return hasLiveAvatar(signals.imageUrl) || hasAvaAvatar(_state);
}

/**
 * Derive durable helper flags from live vault signals so resume never
 * re-asks for finished setup (name, avatar, photos, memory, etc.).
 */
function reconcileHelperProgress(
  state: UserOnboardingState,
  signals: AvaSignals,
): {
  state: UserOnboardingState;
  progressPatch: AvaHelperProgress;
  helperStep: AvaStepId | null;
  dirty: boolean;
} {
  const hp: AvaHelperProgress = { ...(state.helperProgress ?? emptyProgress()) };
  const progressPatch: AvaHelperProgress = {};
  let dirty = false;

  const mark = <K extends keyof AvaHelperProgress>(
    key: K,
    value: AvaHelperProgress[K],
  ) => {
    if (hp[key] === value) return;
    hp[key] = value;
    progressPatch[key] = value;
    dirty = true;
  };

  const screenNameDone = hasLiveScreenName(signals.displayName);
  const avatarDone = hasLiveAvatar(signals.imageUrl);
  const uploadDone = signals.mediaCount > 0;
  const photosReady = signals.cleanPhotoCount >= 1;
  const memoryDone = signals.memoryCount > 0;
  const pastBasics =
    uploadDone ||
    photosReady ||
    memoryDone ||
    signals.movieCount > 0 ||
    signals.peopleCount > 0 ||
    signals.inviteCount > 0 ||
    signals.assistantConversationCount > 0;

  // Never auto-skip the welcome popup just because Clerk already has a name.
  if (pastBasics || Boolean(state.welcomeSeenAt)) {
    mark("welcomeSeen", true);
  }
  if (screenNameDone) {
    mark("screenNameSet", true);
  }
  if (avatarDone && !hp.avatarSkipped) {
    mark("avatarSet", true);
  }
  // Clean photos alone keep a one-shot quiet tip available; stamp celebrated
  // once the user has clearly moved on.
  if (
    photosReady &&
    (memoryDone ||
      signals.movieCount > 0 ||
      signals.peopleCount > 0 ||
      signals.inviteCount > 0 ||
      signals.assistantConversationCount > 0)
  ) {
    mark("photosReadyCelebrated", true);
  }
  // 5+ clean photos notes encourage eligibility; memory presence completes it.
  if (signals.cleanPhotoCount >= 5 || memoryDone) {
    mark("encourageMemoryPrompted", true);
  }
  if (memoryDone) {
    mark("memoryCelebrated", true);
  }
  if (signals.peopleCount > 0) {
    mark("peopleExplained", true);
  }

  // Advance helperStep off completed early steps.
  let helperStep = (state.helperStep as AvaStepId | null) ?? null;
  const earlyDone: AvaStepId[] = [];
  if (hp.welcomeSeen || state.welcomeSeenAt) earlyDone.push("welcome");
  if (screenNameDone) earlyDone.push("screen_name");
  if (avatarDone) earlyDone.push("avatar");
  if (uploadDone) earlyDone.push("upload");
  if (photosReady) earlyDone.push("moderation", "photos_ready");
  if (memoryDone) earlyDone.push("encourage_memory", "create_memory");
  if (signals.movieCount > 0) earlyDone.push("create_movie");
  if (signals.assistantConversationCount > 0) earlyDone.push("ask_ai");
  if (signals.inviteCount > 0) earlyDone.push("invite");

  if (helperStep && earlyDone.includes(helperStep)) {
    helperStep = null;
    dirty = true;
  }

  const nextState: UserOnboardingState = {
    ...state,
    helperProgress: hp,
    helperStep,
    ...(hp.welcomeSeen && !state.welcomeSeenAt
      ? { welcomeSeenAt: new Date().toISOString() }
      : {}),
  };

  return { state: nextState, progressPatch, helperStep, dirty };
}

function step(
  partial: Omit<AvaStep, "status"> & { status: AvaStepStatus },
): AvaStep {
  return partial;
}

async function translatorForUser(userId: string): Promise<TranslateFn> {
  try {
    const prefs = await getAccountPreferences(userId);
    const locale = isAppLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE;
    return createTranslator(locale);
  } catch {
    return createTranslator(DEFAULT_LOCALE);
  }
}

function buildSteps(
  state: UserOnboardingState,
  signals: AvaSignals,
  t: TranslateFn = createTranslator(DEFAULT_LOCALE),
): AvaStep[] {
  const hp = state.helperProgress ?? emptyProgress();
  const welcomeDone =
    Boolean(hp.welcomeSeen) || Boolean(state.welcomeSeenAt);
  const screenNameDone = hasLiveScreenName(signals.displayName);
  const avatarDone = hasLiveAvatar(signals.imageUrl);
  const identityDone = welcomeDone && screenNameDone && avatarDone;
  const uploadDone = signals.mediaCount > 0;
  const waitingModeration =
    identityDone &&
    uploadDone &&
    signals.cleanPhotoCount === 0 &&
    (signals.pendingModerationCount > 0 || signals.mediaCount > 0);
  const photosReadyDone = signals.cleanPhotoCount >= 1;
  const memoryDone = signals.memoryCount > 0;
  /** Five+ clean/ready photos owned by the user. */
  const encourageMemoryEligible =
    identityDone && signals.cleanPhotoCount >= 5 && !memoryDone;
  const postMemoryUnlocked = identityDone && memoryDone;

  const peopleDone =
    signals.peopleCount > 0 ||
    Boolean(hp.peopleExplained) ||
    Boolean(hp.peopleSkipped);
  const movieDone = signals.movieCount > 0 || Boolean(hp.movieSkipped);
  const askAiDone =
    signals.assistantConversationCount > 0 || Boolean(hp.askAiSkipped);
  const inviteDone = signals.inviteCount > 0 || Boolean(hp.inviteSkipped);
  const docsDone =
    Boolean(hp.documentsIntroSeen) || Boolean(hp.documentsSkipped);
  /** Light intro only after a few post-Memory steps are handled. */
  const docsUnlocked =
    postMemoryUnlocked &&
    (peopleDone || movieDone || askAiDone || inviteDone || memoryDone);

  const movieHref = signals.latestMemoryId
    ? `/memories/${signals.latestMemoryId}`
    : "/movies";

  const coreDone =
    welcomeDone &&
    screenNameDone &&
    avatarDone &&
    uploadDone &&
    signals.cleanPhotoCount >= 1 &&
    memoryDone;
  const completeDone =
    Boolean(state.helperCompletedAt) ||
    (coreDone && Boolean(hp.completionCelebrated));

  const steps: AvaStep[] = [
    step({
      id: "welcome",
      title: t("ava.steps.welcomeTitle"),
      description: t("ava.steps.welcomeDescription"),
      href: null,
      ctaLabel: t("ava.steps.welcomeCta"),
      optional: false,
      status: welcomeDone ? "done" : "available",
      inline: "acknowledge",
    }),
    step({
      id: "screen_name",
      title: t("ava.steps.screenNameTitle"),
      description: t("ava.steps.screenNameDescription"),
      href: null,
      ctaLabel: t("ava.steps.screenNameCta"),
      optional: false,
      status: !welcomeDone
        ? "locked"
        : screenNameDone
          ? "done"
          : "available",
      inline: "screen_name",
    }),
    step({
      id: "avatar",
      title: t("ava.steps.avatarTitle"),
      description: t("ava.steps.avatarDescription"),
      href: null,
      ctaLabel: t("ava.steps.avatarCta"),
      optional: false,
      status: !welcomeDone || !screenNameDone
        ? "locked"
        : avatarDone
          ? "done"
          : "available",
      inline: "avatar",
    }),
    step({
      id: "upload",
      title: t("ava.steps.uploadTitle"),
      description: t("ava.steps.uploadDescription"),
      href: "/upload",
      ctaLabel: t("ava.steps.uploadCta"),
      optional: false,
      status: !identityDone
        ? "locked"
        : uploadDone
          ? "done"
          : "available",
    }),
    step({
      id: "moderation",
      title: t("ava.steps.moderationTitle"),
      description: t("ava.steps.moderationDescription"),
      href: null,
      ctaLabel: t("ava.steps.moderationCta"),
      optional: false,
      status: waitingModeration
        ? "available"
        : identityDone && uploadDone && signals.cleanPhotoCount >= 1
          ? "done"
          : "locked",
      inline: "acknowledge",
    }),
    step({
      id: "photos_ready",
      title: t("ava.steps.photosReadyTitle"),
      description: t("ava.steps.photosReadyDescription"),
      href: "/media",
      ctaLabel: t("ava.steps.photosReadyCta"),
      optional: false,
      // Live signal: clean photo ⇒ complete (no redo on resume).
      status: identityDone && photosReadyDone ? "done" : "locked",
    }),
    step({
      id: "encourage_memory",
      title: t("ava.steps.encourageMemoryTitle"),
      description: t("ava.steps.encourageMemoryDescription"),
      href: "/memories/new",
      ctaLabel: t("ava.steps.encourageMemoryCta"),
      optional: true,
      status: memoryDone || hp.encourageMemorySkipped
        ? "done"
        : encourageMemoryEligible
          ? "available"
          : "locked",
    }),
    step({
      id: "create_memory",
      title: t("ava.steps.createMemoryTitle"),
      description: t("ava.steps.createMemoryDescription"),
      href: memoryDone ? "/memories" : "/memories/new",
      ctaLabel: memoryDone
        ? t("ava.viewMemories")
        : t("ava.steps.createMemoryCta"),
      optional: true,
      // Live signal: memory exists ⇒ complete (celebration may override below).
      status: memoryDone || hp.createMemorySkipped
        ? "done"
        : !identityDone || signals.cleanPhotoCount < 1
          ? "locked"
          : "available",
    }),
    step({
      id: "people",
      title: t("ava.steps.peopleTitle"),
      description: t("ava.steps.peopleDescription"),
      href: "/people",
      ctaLabel: t("ava.steps.peopleCta"),
      optional: true,
      status: !postMemoryUnlocked
        ? "locked"
        : peopleDone
          ? "done"
          : "available",
    }),
    step({
      id: "create_movie",
      title: t("ava.steps.createMovieTitle"),
      description: t("ava.steps.createMovieDescription"),
      href: movieHref,
      ctaLabel: t("ava.steps.createMovieCta"),
      optional: true,
      status: !postMemoryUnlocked
        ? "locked"
        : movieDone
          ? "done"
          : "available",
    }),
    step({
      id: "ask_ai",
      title: t("ava.steps.askAiTitle"),
      description: t("ava.steps.askAiDescription"),
      href: "/assistant",
      ctaLabel: t("ava.steps.askAiCta"),
      optional: true,
      examples: [t("ava.examples.birthday"), t("ava.examples.beach")],
      status: !postMemoryUnlocked
        ? "locked"
        : askAiDone
          ? "done"
          : "available",
    }),
    step({
      id: "invite",
      title: t("ava.steps.inviteTitle"),
      description: t("ava.steps.inviteDescription"),
      href: "/family",
      ctaLabel: t("ava.steps.inviteCta"),
      optional: true,
      status: !postMemoryUnlocked
        ? "locked"
        : inviteDone
          ? "done"
          : "available",
    }),
    step({
      id: "documents_legacy",
      title: t("ava.steps.documentsTitle"),
      description: t("ava.steps.documentsDescription"),
      href: "/documents",
      ctaLabel: t("ava.steps.documentsCta"),
      optional: true,
      status: !docsUnlocked
        ? "locked"
        : docsDone
          ? "done"
          : "available",
    }),
    step({
      id: "complete",
      title: t("ava.steps.completeTitle"),
      description: t("ava.steps.completeDescription"),
      href: "/dashboard",
      ctaLabel: t("ava.steps.completeCta"),
      optional: false,
      status: !coreDone
        ? "locked"
        : completeDone
          ? "done"
          : "available",
      inline: "acknowledge",
    }),
  ];

  return steps;
}

function pickActiveStep(
  steps: AvaStep[],
  preferred: string | null | undefined,
): AvaStepId | null {
  const available = steps.filter((s) => s.status === "available");
  if (preferred) {
    const match = available.find((s) => s.id === preferred);
    if (match) return match.id;
  }
  // Identity first, then upload path, then later milestones.
  const priority: AvaStepId[] = [
    "welcome",
    "screen_name",
    "avatar",
    "upload",
    "moderation",
    "photos_ready",
    "encourage_memory",
    "create_memory",
    "people",
    "create_movie",
    "ask_ai",
    "invite",
    "documents_legacy",
    "complete",
  ];
  for (const id of priority) {
    if (available.some((s) => s.id === id)) return id;
  }
  return available[0]?.id ?? null;
}

export async function getAvaProgress(userId: string): Promise<AvaProgress> {
  const db = getDb();
  const [user, t] = await Promise.all([
    db
      .select({
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        onboarding: users.onboarding,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
    translatorForUser(userId),
  ]);

  const state = normalizeOnboardingState(user?.onboarding);
  // Live profile fields (same source Settings uses after sync).
  const liveDisplayName = user?.displayName?.trim() || null;
  const liveImageUrl = user?.imageUrl?.trim() || null;

  const [
    mediaCount,
    pendingModerationCount,
    cleanPhotoCount,
    memoryCount,
    peopleCount,
    movieCount,
    inviteCount,
    assistantConversationCount,
    latestMemoryId,
  ] = await Promise.all([
    countAnyMedia(userId),
    countPendingModeration(userId),
    countCleanPhotos(userId),
    countMemories(userId),
    countPeople(userId),
    countMovies(userId),
    countInvitesSent(userId),
    countAssistantConversations(userId),
    getLatestMemoryId(userId),
  ]);

  const signals: AvaSignals = {
    mediaCount,
    pendingModerationCount,
    cleanPhotoCount,
    memoryCount,
    peopleCount,
    movieCount,
    inviteCount,
    assistantConversationCount,
    displayName: liveDisplayName,
    imageUrl: liveImageUrl,
    latestMemoryId,
  };

  // Quiet-tip detection from raw flags (before auto-complete stamps).
  // Never interrupt identity setup with photo / Memory tips.
  const rawHp = state.helperProgress ?? emptyProgress();
  const identityReady =
    (Boolean(rawHp.welcomeSeen) || Boolean(state.welcomeSeenAt)) &&
    hasLiveScreenName(signals.displayName) &&
    hasLiveAvatar(signals.imageUrl);
  const photosReadyTip =
    identityReady &&
    signals.cleanPhotoCount >= 1 &&
    !rawHp.photosReadyCelebrated &&
    signals.memoryCount === 0 &&
    signals.movieCount === 0 &&
    signals.peopleCount === 0 &&
    signals.inviteCount === 0 &&
    signals.assistantConversationCount === 0;
  const encourageMemoryEligible =
    identityReady &&
    signals.cleanPhotoCount >= 5 &&
    signals.memoryCount === 0;
  const encourageMemoryPrompt =
    encourageMemoryEligible &&
    !rawHp.encourageMemoryPrompted &&
    !rawHp.encourageMemorySkipped;

  const reconciled = reconcileHelperProgress(state, signals);
  const liveState = reconciled.state;
  if (reconciled.dirty) {
    void patchAvaState(userId, {
      helperProgress: reconciled.progressPatch,
      helperStep: reconciled.helperStep,
      ...(reconciled.state.welcomeSeenAt && !state.welcomeSeenAt
        ? { welcomeSeenAt: reconciled.state.welcomeSeenAt }
        : {}),
    }).catch(() => undefined);
  }

  const steps = buildSteps(liveState, signals, t);
  const completedCount = steps.filter((s) => s.status === "done").length;
  const percent = Math.round((completedCount / Math.max(steps.length, 1)) * 100);

  const uploadDone = signals.mediaCount > 0;
  const identityLive = identitySetupComplete(liveState, signals);
  const welcomeLive =
    Boolean(liveState.helperProgress?.welcomeSeen) ||
    Boolean(liveState.welcomeSeenAt);
  const waitingModeration =
    welcomeLive &&
    identityLive &&
    uploadDone &&
    signals.cleanPhotoCount === 0 &&
    (signals.pendingModerationCount > 0 || signals.mediaCount > 0);

  const coreDone =
    CORE_DONE_IDS.every((id) => {
      const s = steps.find((x) => x.id === id);
      return s?.status === "done";
    }) &&
    signals.cleanPhotoCount >= 1 &&
    signals.memoryCount > 0;

  // Auto-stamp helper completion when core path is done.
  if (
    liveState.eligible &&
    coreDone &&
    !liveState.helperCompletedAt &&
    !liveState.helperDismissedAt
  ) {
    void patchAvaState(userId, {
      helperCompletedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  const preferredStep =
    !welcomeLive
      ? "welcome"
      : !hasLiveScreenName(signals.displayName)
        ? "screen_name"
        : !hasLiveAvatar(signals.imageUrl)
          ? "avatar"
          : photosReadyTip
            ? "photos_ready"
            : encourageMemoryPrompt
              ? "encourage_memory"
              : waitingModeration
                ? "moderation"
                : liveState.helperStep;

  // Align helperStep with live signals — do NOT clear soft-dismiss here.
  if (photosReadyTip && liveState.helperStep !== "photos_ready") {
    void patchAvaState(userId, { helperStep: "photos_ready" }).catch(
      () => undefined,
    );
  } else if (
    encourageMemoryPrompt &&
    liveState.helperStep !== "encourage_memory"
  ) {
    void patchAvaState(userId, {
      helperStep: "encourage_memory",
      helperProgress: { encourageMemoryPrompted: true },
    }).catch(() => undefined);
  } else if (
    waitingModeration &&
    liveState.helperStep !== "moderation" &&
    liveState.helperStep !== "photos_ready"
  ) {
    void patchAvaState(userId, { helperStep: "moderation" }).catch(
      () => undefined,
    );
  }

  const eligible = liveState.eligible === true;
  const helperEnabled = liveState.helperEnabled !== false;
  const dismissed = Boolean(liveState.helperDismissedAt);
  const completed = Boolean(liveState.helperCompletedAt);
  const celebrated =
    liveState.helperProgress?.completionCelebrated === true;
  const welcomeSeen =
    Boolean(liveState.helperProgress?.welcomeSeen) ||
    Boolean(liveState.welcomeSeenAt);

  const hasScreenName = hasLiveScreenName(signals.displayName);
  const hasAvatar = hasLiveAvatar(signals.imageUrl);
  /**
   * Live profile only — do not trust helper_step alone.
   * Soft-dismiss must NOT block identity when either field is missing.
   */
  const identityIncomplete =
    helperEnabled &&
    !(completed && celebrated) &&
    (!welcomeSeen || !hasScreenName || !hasAvatar);

  /** Prompt identity on load even after a soft dismiss (client opens once/session). */
  const identityAutoOpen = identityIncomplete;

  /** Major progress events — may nudge even after a soft cancel. */
  let autoOpenReason: AvaAutoOpenReason | null = null;
  if (helperEnabled && !(completed && celebrated)) {
    if (identityAutoOpen) {
      autoOpenReason = "identity_setup";
    } else if (eligible && photosReadyTip) {
      autoOpenReason = "photos_ready";
    } else if (eligible && encourageMemoryPrompt) {
      autoOpenReason = "encourage_memory";
    }
  }

  const autoOpenDecision = Boolean(autoOpenReason);

  // Temporary proof logging for identity auto-open (remove after verified).
  console.info("[ava.autoOpen]", {
    userId,
    hasScreenName,
    hasAvatar,
    welcomeSeen,
    helper_step: liveState.helperStep,
    eligible,
    dismissed,
    identityIncomplete,
    autoOpenReason,
    autoOpenDecision,
  });

  let activeStepId = pickActiveStep(steps, preferredStep);

  // Quiet tips can surface a step even when live signals already mark it done
  // (so resume skips redo, but the one-shot celebration still shows once).
  if (autoOpenReason === "photos_ready") {
    activeStepId = "photos_ready";
    const tip = steps.find((s) => s.id === "photos_ready");
    if (tip) tip.status = "active";
  } else if (autoOpenReason === "identity_setup") {
    // Keep preferred identity step active for the forced setup flow.
    const identityIds: AvaStepId[] = ["welcome", "screen_name", "avatar"];
    if (!activeStepId || !identityIds.includes(activeStepId)) {
      activeStepId =
        identityIds.find((id) =>
          steps.some((s) => s.id === id && s.status === "available"),
        ) ?? activeStepId;
    }
    for (const s of steps) {
      if (s.id === activeStepId && s.status === "available") {
        s.status = "active";
      }
    }
  } else {
    for (const s of steps) {
      if (s.id === activeStepId && s.status === "available") {
        s.status = "active";
      }
    }
  }

  const showPanel = Boolean(autoOpenReason);

  const showResumeChip =
    (eligible || identityIncomplete) &&
    helperEnabled &&
    dismissed &&
    !celebrated;

  /**
   * Header icon when Ava tips are enabled — also when identity is incomplete
   * so the forced Welcome flow can render even if eligible was never stamped.
   */
  const showHeaderIcon =
    helperEnabled && (eligible || identityIncomplete);

  /** Badge when there’s something Ava can help with next. */
  const hasRecommendedAction =
    showHeaderIcon &&
    (identityIncomplete ||
      (Boolean(activeStepId) && !(completed && celebrated)));

  const pollWhileWaiting =
    eligible &&
    helperEnabled &&
    !(completed && celebrated) &&
    !identityIncomplete &&
    ((signals.mediaCount > 0 && signals.cleanPhotoCount === 0) ||
      photosReadyTip ||
      encourageMemoryPrompt);

  const avatarPreviewUrl = await resolveAvatarPreview(
    userId,
    liveState,
    user?.imageUrl ?? null,
  );

  return {
    showPanel,
    autoOpenReason,
    pollWhileWaiting,
    showResumeChip,
    showHeaderIcon,
    hasRecommendedAction,
    identityIncomplete,
    eligible,
    helperEnabled,
    dismissed,
    completed,
    screenName: liveState.screenName?.trim() || liveDisplayName,
    avatarMediaId: liveState.avatarMediaId ?? null,
    avatarUrl: liveState.avatarUrl ?? null,
    avatarPreviewUrl,
    activeStepId,
    steps,
    visibleSteps: steps.filter((s) => s.status !== "locked"),
    completedCount,
    totalCount: steps.length,
    percent,
    signals,
  };
}

export async function patchAvaState(
  userId: string,
  patch: Partial<UserOnboardingState>,
): Promise<UserOnboardingState> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const base = normalizeOnboardingState(current?.onboarding);
  const nextProgress: AvaHelperProgress = {
    ...base.helperProgress,
    ...patch.helperProgress,
  };

  const next: UserOnboardingState = {
    ...base,
    ...patch,
    helperProgress: nextProgress,
  };

  await db
    .update(users)
    .set({ onboarding: next, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return next;
}

export async function dismissAva(userId: string): Promise<void> {
  const cleanPhotoCount = await countCleanPhotos(userId).catch(() => 0);
  await patchAvaState(userId, {
    helperDismissedAt: new Date().toISOString(),
    ...(cleanPhotoCount >= 1
      ? { helperProgress: { photosReadyCelebrated: true } }
      : {}),
  });
}

export async function resumeAva(userId: string): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(current?.onboarding);
  const skipped = state.helperProgress?.encourageMemorySkipped === true;

  await patchAvaState(userId, {
    helperDismissedAt: null,
    helperEnabled: true,
    ...(skipped
      ? {
          helperStep: "encourage_memory",
          helperProgress: {
            encourageMemoryPrompted: false,
            encourageMemorySkipped: false,
          },
        }
      : {}),
  });
}

export async function disableAva(userId: string): Promise<void> {
  await patchAvaState(userId, {
    helperEnabled: false,
    helperDismissedAt: new Date().toISOString(),
  });
}

export async function setAvaStep(
  userId: string,
  stepId: AvaStepId,
): Promise<void> {
  await patchAvaState(userId, { helperStep: stepId });
}

export async function acknowledgeAvaStep(
  userId: string,
  stepId: AvaStepId,
): Promise<void> {
  const now = new Date().toISOString();
  if (stepId === "welcome") {
    await patchAvaState(userId, {
      welcomeSeenAt: now,
      helperProgress: { welcomeSeen: true },
      helperStep: "screen_name",
    });
    return;
  }
  if (stepId === "photos_ready") {
    await patchAvaState(userId, {
      helperProgress: { photosReadyCelebrated: true },
      helperStep: "create_memory",
    });
    return;
  }
  if (stepId === "create_memory") {
    // Celebrate only when a Memory actually exists.
    const db = getDb();
    const [row] = await db
      .select({ value: count() })
      .from(memories)
      .where(eq(memories.userId, userId));
    if (Number(row?.value ?? 0) < 1) {
      await patchAvaState(userId, {
        helperStep: "create_memory",
        helperDismissedAt: now,
      });
      return;
    }
    await patchAvaState(userId, {
      helperProgress: { memoryCelebrated: true },
      helperStep: "people",
      helperDismissedAt: now,
    });
    return;
  }
  if (stepId === "encourage_memory") {
    // Soft dismiss after CTA — skipped flag set by skipAvaStep.
    await patchAvaState(userId, {
      helperProgress: { encourageMemoryPrompted: true },
      helperStep: "create_memory",
      helperDismissedAt: now,
    });
    return;
  }
  if (stepId === "moderation") {
    // Soft ack while waiting — keep watching for ready photos.
    await patchAvaState(userId, {
      helperStep: "moderation",
      helperDismissedAt: new Date().toISOString(),
    });
    return;
  }
  if (stepId === "people") {
    await patchAvaState(userId, {
      helperProgress: { peopleExplained: true },
      helperDismissedAt: now,
    });
    return;
  }
  if (stepId === "documents_legacy") {
    await patchAvaState(userId, {
      helperProgress: { documentsIntroSeen: true },
      helperDismissedAt: now,
    });
    return;
  }
  if (stepId === "complete") {
    await patchAvaState(userId, {
      helperCompletedAt: now,
      helperProgress: { completionCelebrated: true },
      helperDismissedAt: now,
    });
  }
}

/** Soft-skip an optional Ava step (completion still follows live vault signals). */
export async function skipAvaStep(
  userId: string,
  stepId: AvaStepId,
): Promise<void> {
  const now = new Date().toISOString();
  const progress: AvaHelperProgress = {};

  switch (stepId) {
    case "encourage_memory":
      progress.encourageMemoryPrompted = true;
      progress.encourageMemorySkipped = true;
      break;
    case "create_memory":
      progress.createMemorySkipped = true;
      break;
    case "people":
      progress.peopleSkipped = true;
      progress.peopleExplained = true;
      break;
    case "create_movie":
      progress.movieSkipped = true;
      break;
    case "ask_ai":
      progress.askAiSkipped = true;
      break;
    case "invite":
      progress.inviteSkipped = true;
      break;
    case "documents_legacy":
      progress.documentsIntroSeen = true;
      progress.documentsSkipped = true;
      break;
    default:
      throw new Error("This step can’t be skipped.");
  }

  await patchAvaState(userId, {
    helperProgress: progress,
    helperDismissedAt: now,
  });
}

/** @deprecated Prefer skipAvaStep("encourage_memory"). */
export async function skipEncourageMemory(userId: string): Promise<void> {
  await skipAvaStep(userId, "encourage_memory");
}

export async function setAvaScreenName(
  userId: string,
  screenName: string,
): Promise<void> {
  const validated = validateAvaScreenName(screenName);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  // Shared write: Clerk + users.displayName (Settings source of truth).
  const live = await saveProfileDisplayName(userId, validated.value);

  await patchAvaState(userId, {
    screenName: live.displayName,
    helperProgress: { screenNameSet: true },
    helperStep: "avatar",
  });
}

export async function setAvaAvatar(
  userId: string,
  input: {
    avatarMediaId?: string | null;
    avatarUrl?: string | null;
    skip?: boolean;
  },
): Promise<void> {
  if (input.skip) {
    await patchAvaState(userId, {
      helperProgress: { avatarSkipped: true },
      helperStep: "upload",
    });
    return;
  }

  if (input.avatarMediaId) {
    const db = getDb();
    const [row] = await db
      .select({
        id: media.id,
        originalKey: media.originalKey,
        processedKey: media.processedKey,
        thumbnailKey: media.thumbnailKey,
        status: media.status,
      })
      .from(media)
      .where(
        and(
          eq(media.id, input.avatarMediaId),
          eq(media.userId, userId),
          eq(media.type, "photo"),
          eq(media.moderationStatus, "clean"),
          eq(media.status, "ready"),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error("Choose a ready photo from Photos.");
    }

    let httpsUrl: string | null = null;
    if (isR2Configured()) {
      const key = row.thumbnailKey || row.processedKey || row.originalKey;
      if (key) {
        const signed = await getDownloadUrl(key, undefined, {
          moderationStatus: "clean",
          mediaStatus: row.status,
        });
        httpsUrl = signed.url;
      }
    }
    if (!httpsUrl) {
      throw new Error("Could not load that photo for your profile.");
    }

    const live = await saveProfileAvatar(userId, { httpsUrl });
    await patchAvaState(userId, {
      avatarMediaId: input.avatarMediaId,
      avatarUrl: live.imageUrl,
      helperProgress: { avatarSet: true },
      helperStep: "upload",
    });
    return;
  }

  if (input.avatarUrl) {
    const raw = input.avatarUrl.trim();
    let live;
    if (isAvaAvatarPresetUrl(raw)) {
      live = await saveProfileAvatar(userId, { presetUrl: raw });
    } else if (raw.startsWith("data:")) {
      const validated = validateAvaAvatarDataUrl(raw);
      if (!validated.ok) throw new Error(validated.error);
      live = await saveProfileAvatar(userId, { dataUrl: validated.value });
    } else {
      const resolved = resolveAvaAvatarUrl(raw);
      if (!resolved) {
        throw new Error("That avatar isn’t valid. Try a preset or upload.");
      }
      if (resolved.startsWith("http")) {
        live = await saveProfileAvatar(userId, { httpsUrl: resolved });
      } else if (isAvaAvatarPresetUrl(resolved)) {
        live = await saveProfileAvatar(userId, { presetUrl: resolved });
      } else {
        throw new Error("That avatar isn’t valid. Try a preset or upload.");
      }
    }

    await patchAvaState(userId, {
      avatarUrl: live.imageUrl,
      avatarMediaId: null,
      helperProgress: { avatarSet: true },
      helperStep: "upload",
    });
    return;
  }

  throw new Error("Provide an avatar photo, URL, or skip.");
}

/** Clean photos for Ava avatar picker. */
export async function listAvaAvatarCandidates(
  userId: string,
  limit = 24,
): Promise<{ id: string; previewUrl: string | null; filename: string | null }[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: media.id,
      originalKey: media.originalKey,
      processedKey: media.processedKey,
      thumbnailKey: media.thumbnailKey,
      originalFilename: media.originalFilename,
      status: media.status,
    })
    .from(media)
    .where(and(cleanReadyMediaFilter(userId), eq(media.type, "photo")))
    .orderBy(sql`${media.createdAt} desc`)
    .limit(Math.min(Math.max(limit, 1), 48));

  if (!isR2Configured()) {
    return rows.map((r) => ({
      id: r.id,
      previewUrl: null,
      filename: r.originalFilename,
    }));
  }

  return Promise.all(
    rows.map(async (r) => {
      let previewUrl: string | null = null;
      try {
        const key = r.thumbnailKey || r.processedKey || r.originalKey;
        if (key) {
          const signed = await getDownloadUrl(key, undefined, {
            moderationStatus: "clean",
            mediaStatus: r.status,
          });
          previewUrl = signed.url;
        }
      } catch {
        previewUrl = null;
      }
      return {
        id: r.id,
        previewUrl,
        filename: r.originalFilename,
      };
    }),
  );
}

/** Whether the dashboard checklist should stay hidden (Ava owns the journey). */
export async function shouldHideLegacyChecklist(
  userId: string,
): Promise<boolean> {
  const db = getDb();
  const [user] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(user?.onboarding);
  return state.eligible === true && state.helperEnabled !== false;
}
