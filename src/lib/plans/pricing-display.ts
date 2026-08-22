import { PLAN_CATALOG, type PlanSeed } from "@/lib/plans/catalog";
import type { PlanSlug } from "@/lib/db/schema";
import {
  DEFAULT_LOCALE,
  formatCents as formatCentsIntl,
  type AppLocale,
} from "@/lib/i18n";

/** Plans shown on the public pricing page (excludes Legacy). */
export const PUBLIC_PLAN_SLUGS = ["free", "family", "family_plus"] as const;
export type PublicPlanSlug = (typeof PUBLIC_PLAN_SLUGS)[number];

export const RECOMMENDED_PLAN_SLUG: PublicPlanSlug = "family";

export function getPublicPlans(): PlanSeed[] {
  return PLAN_CATALOG.filter((p) =>
    (PUBLIC_PLAN_SLUGS as readonly string[]).includes(p.slug),
  ).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Beta plan picker: Free / Family / Family Plus / Legacy (prices for context).
 * Only used when NEXT_PUBLIC_BETA_PLAN_PICKER / BETA_BILLING_OVERRIDE is on.
 */
export function getBetaSelectablePlans(): PlanSeed[] {
  return [...PLAN_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function formatStorageLabel(bytes: number | null): string {
  if (bytes == null) return "Unlimited storage";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${tb % 1 === 0 ? tb.toFixed(0) : tb.toFixed(1)} TB storage`;
  }
  return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB storage`;
}

export function formatCents(
  cents: number,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  return formatCentsIntl(cents, locale);
}

export function formatMembersLabel(max: number): string {
  if (max <= 1) return "Just you (personal vault)";
  return `Up to ${max} family members`;
}

export function formatMoviesLabel(max: number): string {
  return `${max} movies per month`;
}

/** Marketing feature bullets for each public plan. */
export function planFeatureBullets(plan: PlanSeed): string[] {
  const bullets: string[] = [
    formatStorageLabel(plan.storageLimitBytes),
    formatMembersLabel(plan.maxFamilyMembers),
    formatMoviesLabel(plan.maxMoviesPerMonth),
  ];

  if (plan.features.faceDetection) {
    bullets.push(
      plan.features.maxPeople
        ? `People & faces (up to ${plan.features.maxPeople})`
        : "People & faces",
    );
  }
  if (plan.features.familySharing) {
    bullets.push("Family sharing & roles");
  } else {
    bullets.push("Private to you");
  }
  if (plan.features.cinematicThemes) {
    bullets.push("Cinematic movie themes");
  } else {
    bullets.push("Simple movie themes");
  }
  if (plan.features.priorityRender) {
    bullets.push("Priority movie rendering");
  }

  return bullets;
}

export function isPublicPlanSlug(value: string): value is PublicPlanSlug {
  return (PUBLIC_PLAN_SLUGS as readonly string[]).includes(value);
}

export function isPaidPublicPlan(
  slug: string,
): slug is Extract<PublicPlanSlug, "family" | "family_plus"> {
  return slug === "family" || slug === "family_plus";
}

export function planDisplayName(slug: PlanSlug | string): string {
  return PLAN_CATALOG.find((p) => p.slug === slug)?.name ?? slug;
}
