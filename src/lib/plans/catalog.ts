import type { PlanFeatures, PlanSlug } from "@/lib/db/schema";

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export type PlanSeed = {
  id: string;
  name: string;
  slug: PlanSlug;
  description: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  storageLimitBytes: number | null;
  maxFamilyMembers: number;
  maxMoviesPerMonth: number;
  maxActiveMovieJobs: number;
  features: PlanFeatures;
  sortOrder: number;
};

/**
 * Canonical plan catalog. Seeded into `plans` and used as Free fallback
 * when the DB row is missing.
 */
export const PLAN_CATALOG: readonly PlanSeed[] = [
  {
    id: "plan_free",
    name: "Free",
    slug: "free",
    description: "Get started with a personal vault and a few movies each month.",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    storageLimitBytes: 5 * GB,
    maxFamilyMembers: 1,
    maxMoviesPerMonth: 5,
    maxActiveMovieJobs: 1,
    features: {
      familySharing: false,
      faceDetection: true,
      cinematicThemes: false,
      priorityRender: false,
      aiSoundtrack: false,
      maxAiSoundtracksPerMonth: 0,
      maxPeople: 25,
      supportLevel: "community",
      removeMovieWatermark: false,
    },
    sortOrder: 0,
  },
  {
    id: "plan_family",
    name: "Family",
    slug: "family",
    description:
      "Share a household vault, more storage, and room for everyone to contribute.",
    priceMonthlyCents: 999,
    priceYearlyCents: 9990,
    storageLimitBytes: 100 * GB,
    maxFamilyMembers: 6,
    maxMoviesPerMonth: 30,
    maxActiveMovieJobs: 2,
    features: {
      familySharing: true,
      faceDetection: true,
      cinematicThemes: true,
      priorityRender: false,
      aiSoundtrack: true,
      maxAiSoundtracksPerMonth: 5,
      maxPeople: 100,
      supportLevel: "standard",
      removeMovieWatermark: true,
    },
    sortOrder: 1,
  },
  {
    id: "plan_family_plus",
    name: "Family Plus",
    slug: "family_plus",
    description:
      "Larger library, more relatives, and priority movie rendering.",
    priceMonthlyCents: 1999,
    priceYearlyCents: 19990,
    storageLimitBytes: 1 * TB,
    maxFamilyMembers: 12,
    maxMoviesPerMonth: 100,
    maxActiveMovieJobs: 3,
    features: {
      familySharing: true,
      faceDetection: true,
      cinematicThemes: true,
      priorityRender: true,
      aiSoundtrack: true,
      maxAiSoundtracksPerMonth: 25,
      maxPeople: 250,
      supportLevel: "priority",
      removeMovieWatermark: true,
    },
    sortOrder: 2,
  },
  {
    id: "plan_legacy",
    name: "Legacy+",
    slug: "legacy",
    description:
      "Top-tier vault — Digital Legacy, Private Documents, Connected Accounts, and generous limits.",
    /** Display / context pricing for beta; grandfathered Stripe checkouts stay closed. */
    priceMonthlyCents: 2999,
    priceYearlyCents: 29990,
    storageLimitBytes: null,
    maxFamilyMembers: 20,
    maxMoviesPerMonth: 200,
    maxActiveMovieJobs: 5,
    features: {
      familySharing: true,
      faceDetection: true,
      cinematicThemes: true,
      priorityRender: true,
      aiSoundtrack: true,
      maxAiSoundtracksPerMonth: 100,
      maxPeople: null,
      supportLevel: "priority",
      /** Unlocks Digital Legacy, Private Documents, Connected Accounts. */
      legacy: true,
      privateDocuments: true,
      digitalLegacy: true,
      connectedAccounts: true,
      removeMovieWatermark: true,
    },
    sortOrder: 99,
  },
] as const;

export const FREE_PLAN = PLAN_CATALOG.find((p) => p.slug === "free")!;

export function getCatalogPlan(slug: PlanSlug): PlanSeed {
  const plan = PLAN_CATALOG.find((p) => p.slug === slug);
  if (!plan) return FREE_PLAN;
  return plan;
}
