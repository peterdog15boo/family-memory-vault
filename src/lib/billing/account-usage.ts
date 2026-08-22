import {
  formatBillingDate,
  formatUsagePeriodReset,
  computePercentUsed,
  getUsageLevel,
  type UsageLevel,
} from "@/lib/billing/usage-thresholds";
import {
  formatBytes,
  getStorageQuotaForUser,
  type StorageQuotaSnapshot,
} from "@/lib/billing/quotas";
import { getDb } from "@/lib/db";
import { families } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { countMoviesCreatedThisMonth, getUserPlan } from "@/lib/plans";
import { countFamilyMemberSeats } from "@/lib/plans/gates";
import { resolveUserLocale } from "@/lib/i18n/user-locale";

export type UsageMeter = {
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  level: UsageLevel;
  label: string;
  detail?: string;
};

export type UsageWarning = {
  kind: "storage" | "movies" | "seats";
  level: UsageLevel;
  title: string;
  message: string;
};

export type AccountUsageSummary = {
  planName: string;
  planSlug: string;
  billingInterval: string | null;
  /** stripe | admin | beta | free | null */
  planSource: string | null;
  nextBillingDate: Date | null;
  nextBillingLabel: string | null;
  canManageBilling: boolean;
  storage: StorageQuotaSnapshot;
  storageMeter: UsageMeter;
  movies: UsageMeter;
  seats: UsageMeter;
  moviesPeriodResetLabel: string;
  warnings: UsageWarning[];
};

function buildStorageMeter(snapshot: StorageQuotaSnapshot): UsageMeter {
  const level = getUsageLevel(snapshot.percentUsed);
  return {
    used: snapshot.usedBytes,
    limit: snapshot.limitBytes,
    remaining: snapshot.remainingBytes,
    percentUsed: snapshot.percentUsed,
    level,
    label: snapshot.label,
    detail:
      snapshot.limitBytes == null
        ? "Unlimited storage on this plan."
        : level === "critical"
          ? "Storage is full — free up space or upgrade to upload more."
          : level === "warning" && snapshot.remainingBytes != null
            ? `You're getting close — ${formatBytes(snapshot.remainingBytes, 1)} left.`
            : snapshot.remainingBytes != null
              ? `${formatBytes(snapshot.remainingBytes, 1)} remaining.`
              : undefined,
  };
}

function buildMoviesMeter(
  used: number,
  limit: number,
  planName: string,
): UsageMeter {
  const remaining = Math.max(0, limit - used);
  const percentUsed = computePercentUsed(used, limit);
  const level = getUsageLevel(percentUsed);
  const label =
    limit <= 0
      ? `${used} movies this month`
      : `${used} of ${limit} movies this month`;

  let detail: string | undefined;
  if (level === "critical") {
    detail = `You've used all ${limit} movies on the ${planName} plan this month.`;
  } else if (level === "warning") {
    detail = `Only ${remaining} movie${remaining === 1 ? "" : "s"} left this month.`;
  } else if (remaining > 0) {
    detail = `${remaining} movie${remaining === 1 ? "" : "s"} remaining this month.`;
  }

  return {
    used,
    limit,
    remaining,
    percentUsed,
    level,
    label,
    detail,
  };
}

function buildSeatsMeter(used: number, limit: number): UsageMeter {
  const cappedLimit = Math.max(1, limit);
  const remaining = Math.max(0, cappedLimit - used);
  const percentUsed = computePercentUsed(used, cappedLimit);
  const level = getUsageLevel(percentUsed);
  return {
    used,
    limit: cappedLimit,
    remaining,
    percentUsed,
    level,
    label: `${used} of ${cappedLimit} family seats`,
    detail:
      cappedLimit <= 1
        ? "Personal vault — invite seats unlock on Family and above."
        : level === "critical"
          ? "All member seats are in use. Upgrade for more family seats."
          : `${remaining} seat${remaining === 1 ? "" : "s"} left for invites.`,
  };
}

function buildWarnings(
  storageMeter: UsageMeter,
  movies: UsageMeter,
  seats: UsageMeter,
  planName: string,
): UsageWarning[] {
  const warnings: UsageWarning[] = [];

  if (storageMeter.level === "warning") {
    warnings.push({
      kind: "storage",
      level: "warning",
      title: "Your vault is getting full",
      message: `You've used most of your ${planName} storage. Free up a few older photos or upgrade when you're ready — your memories stay safe either way.`,
    });
  } else if (storageMeter.level === "critical") {
    warnings.push({
      kind: "storage",
      level: "critical",
      title: "Your vault is full",
      message:
        "New uploads are paused for now. Remove something you no longer need, or upgrade for more room. Everything you've already saved is safe.",
    });
  }

  if (movies.level === "warning") {
    warnings.push({
      kind: "movies",
      level: "warning",
      title: "Almost out of movies this month",
      message: `You're close to your monthly movie limit on ${planName}. Save a slot for something special, or upgrade for more.`,
    });
  } else if (movies.level === "critical") {
    warnings.push({
      kind: "movies",
      level: "critical",
      title: "You've used this month's movies",
      message: `All of your movies for this month on ${planName} are used up. They refresh next month — or upgrade anytime for a higher limit.`,
    });
  }

  if (seats.limit != null && seats.limit > 1 && seats.level === "critical") {
    warnings.push({
      kind: "seats",
      level: "critical",
      title: "Family seats are full",
      message: `You've used every member seat on ${planName}. Upgrade when you need room for another invite.`,
    });
  }

  return warnings;
}

/**
 * Aggregates plan, storage, movies, seats, and billing dates for account UI.
 */
export async function getAccountUsageSummary(
  userId: string,
): Promise<AccountUsageSummary> {
  const [planCtx, storage, moviesUsed, locale] = await Promise.all([
    getUserPlan(userId),
    getStorageQuotaForUser(userId),
    countMoviesCreatedThisMonth(userId),
    resolveUserLocale(userId),
  ]);

  const db = getDb();
  const [ownedFamily] = await db
    .select({ id: families.id })
    .from(families)
    .where(eq(families.createdByUserId, userId))
    .limit(1);
  const seatsUsed = ownedFamily
    ? await countFamilyMemberSeats(ownedFamily.id)
    : 0;

  const storageMeter = buildStorageMeter(storage);
  const movies = buildMoviesMeter(
    moviesUsed,
    planCtx.limits.maxMoviesPerMonth,
    planCtx.plan.name,
  );
  const seats = buildSeatsMeter(seatsUsed, planCtx.limits.maxFamilyMembers);

  const nextBillingDate = planCtx.subscription?.currentPeriodEnd ?? null;
  const isPaid =
    planCtx.plan.slug !== "free" && planCtx.plan.slug !== "legacy";

  return {
    planName: planCtx.plan.name,
    planSlug: String(planCtx.plan.slug),
    billingInterval: planCtx.subscription?.billingInterval ?? null,
    planSource: planCtx.subscription?.planSource ?? null,
    nextBillingDate,
    nextBillingLabel:
      nextBillingDate && isPaid
        ? formatBillingDate(nextBillingDate, locale)
        : null,
    canManageBilling: Boolean(
      planCtx.subscription?.stripeCustomerId ||
        planCtx.subscription?.stripeSubscriptionId,
    ),
    storage,
    storageMeter,
    movies,
    seats,
    moviesPeriodResetLabel: formatUsagePeriodReset(undefined, locale),
    warnings: buildWarnings(storageMeter, movies, seats, planCtx.plan.name),
  };
}
