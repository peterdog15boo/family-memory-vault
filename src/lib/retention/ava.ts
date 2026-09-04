/**
 * Ava-facing retention tip attach + snooze / complete helpers.
 */

import { eq } from "drizzle-orm";
import { getAccountPreferences } from "@/lib/account-preferences";
import { normalizeOnboardingState } from "@/lib/ava/onboarding-state";
import { getDb } from "@/lib/db";
import {
  users,
  type AvaHelperProgress,
  type UserOnboardingState,
} from "@/lib/db/schema";
import { isUserDormant } from "@/lib/retention/dormancy";
import { isRetentionAvaEnabled } from "@/lib/retention/flags";
import {
  loadRetentionVaultSnapshot,
  syncCompletenessStallStamp,
} from "@/lib/retention/snapshot";
import {
  buildRetentionTipCard,
  pickRetentionTipId,
} from "@/lib/retention/tips";
import {
  RETENTION_TIP_COOLDOWN_HOURS,
  RETENTION_TIP_SNOOZE_DAYS,
  type RetentionTipCard,
  type RetentionTipId,
  type RetentionTipSnooze,
} from "@/lib/retention/types";

function parseSnoozes(
  raw: AvaHelperProgress["retentionSnoozes"],
): RetentionTipSnooze[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is RetentionTipSnooze =>
      Boolean(s) &&
      typeof s === "object" &&
      typeof (s as RetentionTipSnooze).tipId === "string" &&
      typeof (s as RetentionTipSnooze).until === "string",
  );
}

async function patchHelperProgress(
  userId: string,
  helperProgress: Partial<AvaHelperProgress>,
): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const base = normalizeOnboardingState(current?.onboarding);
  const next: UserOnboardingState = {
    ...base,
    helperProgress: {
      ...base.helperProgress,
      ...helperProgress,
    },
  };
  await db
    .update(users)
    .set({ onboarding: next, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function resolveRetentionAvaTip(userId: string): Promise<{
  dormant: boolean;
  tip: RetentionTipCard | null;
  canAutoOpen: boolean;
}> {
  if (!isRetentionAvaEnabled()) {
    return { dormant: false, tip: null, canAutoOpen: false };
  }

  const snapshot = await loadRetentionVaultSnapshot(userId);
  await syncCompletenessStallStamp(userId, snapshot.completenessNextId);

  const dormant = isUserDormant(snapshot);
  if (!dormant) {
    return { dormant: false, tip: null, canAutoOpen: false };
  }

  const db = getDb();
  const [row] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(row?.onboarding);
  if (state.helperEnabled === false) {
    return { dormant: true, tip: null, canAutoOpen: false };
  }

  const prefs = await getAccountPreferences(userId);
  const weekIndex = prefs.weeklyEmailWeekIndex ?? 0;
  const progress = state.helperProgress ?? {};
  const tipId = pickRetentionTipId(snapshot, {
    snoozes: parseSnoozes(progress.retentionSnoozes),
    completed: progress.retentionCompletedTips ?? [],
    weekIndex,
  });
  if (!tipId) {
    return { dormant: true, tip: null, canAutoOpen: false };
  }

  const tip = buildRetentionTipCard(tipId, snapshot);
  const lastShown = progress.lastRetentionTipAt;
  let canAutoOpen = true;
  if (lastShown) {
    const hours =
      (Date.now() - new Date(lastShown).getTime()) / (60 * 60 * 1000);
    if (Number.isFinite(hours) && hours < RETENTION_TIP_COOLDOWN_HOURS) {
      canAutoOpen = false;
    }
  }

  return { dormant: true, tip, canAutoOpen };
}

export async function snoozeRetentionTip(
  userId: string,
  tipId: RetentionTipId,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(row?.onboarding);
  const until = new Date(
    Date.now() + RETENTION_TIP_SNOOZE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const snoozes = parseSnoozes(state.helperProgress?.retentionSnoozes).filter(
    (s) => s.tipId !== tipId,
  );
  snoozes.push({ tipId, until });
  await patchHelperProgress(userId, { retentionSnoozes: snoozes });
}

export async function completeRetentionTip(
  userId: string,
  tipId: RetentionTipId,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(row?.onboarding);
  const completed = new Set(state.helperProgress?.retentionCompletedTips ?? []);
  completed.add(tipId);
  await patchHelperProgress(userId, {
    retentionCompletedTips: [...completed],
  });
}

export async function stampRetentionTipShown(userId: string): Promise<void> {
  await patchHelperProgress(userId, {
    lastRetentionTipAt: new Date().toISOString(),
  });
}
