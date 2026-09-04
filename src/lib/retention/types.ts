/**
 * Soft retention tips — Ava voice + weekly email focus keys.
 */

export const RETENTION_TIP_IDS = [
  "upload_photo",
  "create_memory",
  "simple_movie",
  "name_people",
  "invite_family",
  "family_tree",
  "documents_legacy",
  "on_this_day",
  "ask_ai",
  "family_chat",
] as const;

export type RetentionTipId = (typeof RETENTION_TIP_IDS)[number];

export type RetentionTipSnooze = {
  tipId: RetentionTipId;
  until: string;
};

export type RetentionTipCard = {
  id: RetentionTipId;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  /** Soft Legacy+ note — never “locked”. */
  upgradeNote?: string | null;
};

export type RetentionVaultSnapshot = {
  mediaCount: number;
  cleanUsableMediaCount: number;
  memoryCount: number;
  peopleCount: number;
  namedPeopleCount: number;
  movieCount: number;
  hasInvitedFamily: boolean;
  hasFamilyWithOthers: boolean;
  hasUsedFamilyChat: boolean;
  hasUsedAskAi: boolean;
  hasOpenedOnThisDay: boolean;
  hasLegacyPlus: boolean;
  hasFamilyTree: boolean;
  accountAgeDays: number;
  lastActiveAt: Date | null;
  lastMeaningfulActionAt: Date | null;
  completenessNextId: string | null;
  completenessStalledSince: string | null;
};

export const RETENTION_DORMANT_DAYS = 7;
export const RETENTION_TIP_SNOOZE_DAYS = 7;
export const RETENTION_TIP_COOLDOWN_HOURS = 24;
export const RETENTION_EMAIL_COOLDOWN_DAYS = 7;
export const RETENTION_EMAIL_MIN_ACCOUNT_DAYS = 3;
/** Client idle before showing a dormant Ava tip (ms). */
export const RETENTION_IDLE_MS = 60_000;
export const MOVIE_OR_MEMORY_TIP_MIN_MEDIA = 5;
