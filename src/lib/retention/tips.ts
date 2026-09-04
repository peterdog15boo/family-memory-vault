/**
 * Retention tip eligibility + rotation (pure where possible).
 */

import {
  MOVIE_OR_MEMORY_TIP_MIN_MEDIA,
  RETENTION_TIP_IDS,
  type RetentionTipCard,
  type RetentionTipId,
  type RetentionTipSnooze,
  type RetentionVaultSnapshot,
} from "@/lib/retention/types";

export function isTipSnoozed(
  tipId: RetentionTipId,
  snoozes: readonly RetentionTipSnooze[] | null | undefined,
  now = new Date(),
): boolean {
  const hit = (snoozes ?? []).find((s) => s.tipId === tipId);
  if (!hit?.until) return false;
  const until = new Date(hit.until).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

export function isTipCompleted(
  tipId: RetentionTipId,
  completed: readonly string[] | null | undefined,
): boolean {
  return (completed ?? []).includes(tipId);
}

/**
 * First unused eligible tip in product order; then rotate from week index.
 */
export function pickRetentionTipId(
  snapshot: RetentionVaultSnapshot,
  options: {
    snoozes?: readonly RetentionTipSnooze[] | null;
    completed?: readonly string[] | null;
    weekIndex?: number;
    now?: Date;
  } = {},
): RetentionTipId | null {
  const now = options.now ?? new Date();
  const eligible = RETENTION_TIP_IDS.filter((id) => {
    if (isTipCompleted(id, options.completed)) return false;
    if (isTipSnoozed(id, options.snoozes, now)) return false;
    return isRetentionTipEligible(id, snapshot);
  });
  if (eligible.length === 0) return null;

  // Prefer first unused in catalog order.
  const first = eligible[0]!;
  const idx = Math.abs(options.weekIndex ?? 0) % eligible.length;
  // Rotate only after the primary tip has been used before (completed/snoozed
  // already removed). Using week index among remaining keeps email + Ava aligned.
  return eligible[idx] ?? first;
}

export function isRetentionTipEligible(
  tipId: RetentionTipId,
  snapshot: RetentionVaultSnapshot,
): boolean {
  switch (tipId) {
    case "upload_photo":
      return snapshot.mediaCount === 0;
    case "create_memory":
      return (
        snapshot.cleanUsableMediaCount >= MOVIE_OR_MEMORY_TIP_MIN_MEDIA &&
        snapshot.memoryCount === 0
      );
    case "simple_movie":
      return (
        snapshot.cleanUsableMediaCount >= MOVIE_OR_MEMORY_TIP_MIN_MEDIA &&
        snapshot.movieCount === 0
      );
    case "name_people":
      return snapshot.mediaCount > 0 && snapshot.namedPeopleCount === 0;
    case "invite_family":
      return (
        (snapshot.mediaCount > 0 || snapshot.movieCount > 0) &&
        !snapshot.hasInvitedFamily
      );
    case "family_tree":
      return true;
    case "documents_legacy":
      return true;
    case "on_this_day":
      return snapshot.mediaCount > 0 && !snapshot.hasOpenedOnThisDay;
    case "ask_ai":
      return snapshot.mediaCount >= 3 && !snapshot.hasUsedAskAi;
    case "family_chat":
      return snapshot.hasFamilyWithOthers && !snapshot.hasUsedFamilyChat;
    default:
      return false;
  }
}

/** Build Ava / email copy for a tip (English strings; UI may re-translate). */
export function buildRetentionTipCard(
  tipId: RetentionTipId,
  snapshot: RetentionVaultSnapshot,
): RetentionTipCard {
  const softLegacy =
    "Family Tree and Documents live on Legacy+. You can peek at Plans anytime — no rush.";

  switch (tipId) {
    case "upload_photo":
      return {
        id: tipId,
        title: "One photo this week is enough",
        description:
          "Add a single photo when you have a quiet minute. Small steps still grow the vault.",
        href: "/upload",
        ctaLabel: "Upload a photo",
      };
    case "create_memory":
      return {
        id: tipId,
        title: "Turn photos into a Memory",
        description: `You have ${snapshot.cleanUsableMediaCount} ready photos. Gather five or more into a Memory you can revisit.`,
        href: "/memories/new",
        ctaLabel: "Create a Memory",
      };
    case "simple_movie":
      return {
        id: tipId,
        title: "Make a Simple Mode movie",
        description:
          "Simple Mode turns ready photos into a short family movie — no editing maze.",
        href: "/movies",
        ctaLabel: "Open Movies",
      };
    case "name_people":
      return {
        id: tipId,
        title: "Name someone in People",
        description:
          "Faces are waiting. Give one person a name so photos find them later.",
        href: "/people",
        ctaLabel: "Open People",
      };
    case "invite_family":
      return {
        id: tipId,
        title: "Invite one family member",
        description:
          "Someone else often has the photos missing from your camera roll.",
        href: "/family",
        ctaLabel: "Invite family",
      };
    case "family_tree":
      return {
        id: tipId,
        title: "Your family tree is waiting when you are",
        description: snapshot.hasFamilyTree
          ? "Spend a quiet minute adding a parent, partner, or child to the tree."
          : "When you are ready to try Legacy+, Family Tree is there to map the generations.",
        href: snapshot.hasFamilyTree ? "/family-tree" : "/pricing",
        ctaLabel: snapshot.hasFamilyTree ? "Open Family Tree" : "Peek at Plans",
        upgradeNote: snapshot.hasFamilyTree ? null : softLegacy,
      };
    case "documents_legacy":
      return {
        id: tipId,
        title: "A calm place for important papers",
        description: snapshot.hasLegacyPlus
          ? "Add one document or note to Digital Legacy when you have a quiet moment."
          : "Documents and Digital Legacy live on Legacy+. Peek at Plans when you are ready — your vault stays yours either way.",
        href: snapshot.hasLegacyPlus ? "/documents" : "/pricing",
        ctaLabel: snapshot.hasLegacyPlus ? "Open Documents" : "Peek at Plans",
        upgradeNote: snapshot.hasLegacyPlus ? null : softLegacy,
      };
    case "on_this_day":
      return {
        id: tipId,
        title: "See what happened On This Day",
        description:
          "A gentle look back at photos from this date in years past.",
        href: "/on-this-day",
        ctaLabel: "Open On This Day",
      };
    case "ask_ai":
      return {
        id: tipId,
        title: "Ask AI about your photos",
        description:
          "Ask a simple question — “photos of birthdays” or “beach trips” — and let Ava’s cousin help you find them.",
        href: "/assistant",
        ctaLabel: "Open Ask AI",
      };
    case "family_chat":
      return {
        id: tipId,
        title: "Say hello in Family Chat",
        description:
          "Your family is already in the vault — send a short note or ask for a photo.",
        href: "/dashboard#family-chat",
        ctaLabel: "Open Family Chat",
      };
    default:
      return {
        id: "upload_photo",
        title: "A small way back into your vault",
        description: "Open Home and take one gentle next step.",
        href: "/dashboard",
        ctaLabel: "Open Home",
      };
  }
}

export function retentionEmailSubject(tipId: RetentionTipId): string {
  switch (tipId) {
    case "upload_photo":
      return "One photo this week is enough";
    case "family_tree":
    case "documents_legacy":
      return "Your family tree is waiting when you are";
    case "create_memory":
    case "simple_movie":
      return "A small way back into your vault";
    default:
      return "A small way back into your vault";
  }
}
