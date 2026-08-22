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
import { countMoviesCreatedThisMonth, getUserPlan } from "@/lib/plans";
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
  kind: "storage" | "movies";
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

function buildWarnings(
  storageMeter: UsageMeter,
  movies: UsageMeter,
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

  return warnings;
}

/**
 * Aggregates plan, storage, movies, and billing dates for account UI.
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

  const storageMeter = buildStorageMeter(storage);
  const movies = buildMoviesMeter(
    moviesUsed,
    planCtx.limits.maxMoviesPerMonth,
    planCtx.plan.name,
  );

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
    moviesPeriodResetLabel: formatUsagePeriodReset(undefined, locale),
    warnings: buildWarnings(storageMeter, movies, planCtx.plan.name),
  };
}
