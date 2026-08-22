/**
 * Friendly copy when guiding users toward Legacy+-only features
 * (Private Documents, Digital Legacy, Connected Accounts, emergency setup).
 */

import {
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import {
  canUseLegacyPlusFeatures,
  hasLegacyPlusFeatures,
} from "@/lib/plans/gates";
import type { PlanFeatures } from "@/lib/db/schema";

export type LegacyPlusFeatureKind =
  | "private_documents"
  | "digital_legacy"
  | "connected_accounts"
  | "emergency_access"
  | "legacy_plus_bundle";

const FEATURE_LABELS: Record<LegacyPlusFeatureKind, string> = {
  private_documents: "Private Documents",
  digital_legacy: "Digital Legacy",
  connected_accounts: "Connected Accounts",
  emergency_access: "Emergency access for Digital Legacy",
  legacy_plus_bundle: "Documents & Digital Legacy",
};

export type LegacyPlusGuidance = {
  hasAccess: boolean;
  featureLabel: string;
  /** Short note for Ava / Ask AI when access is missing. */
  upgradeNote: string | null;
  /** Primary next-step href (Billing in beta, Pricing otherwise). */
  href: string;
  ctaLabel: string;
  betaMode: boolean;
};

export function isBetaPlanModeActive(): boolean {
  return isBetaPlanPickerEnabled() || isBetaBillingOverride();
}

export function legacyPlusFeatureLabel(
  kind: LegacyPlusFeatureKind = "legacy_plus_bundle",
): string {
  return FEATURE_LABELS[kind];
}

/**
 * Build upgrade guidance for a Legacy+ feature. Pass `hasAccess` when already known.
 */
export function buildLegacyPlusGuidance(input: {
  hasAccess: boolean;
  kind?: LegacyPlusFeatureKind;
  betaMode?: boolean;
}): LegacyPlusGuidance {
  const kind = input.kind ?? "legacy_plus_bundle";
  const featureLabel = FEATURE_LABELS[kind];
  const betaMode =
    typeof input.betaMode === "boolean"
      ? input.betaMode
      : isBetaPlanModeActive();

  if (input.hasAccess) {
    return {
      hasAccess: true,
      featureLabel,
      upgradeNote: null,
      href:
        kind === "digital_legacy" || kind === "emergency_access"
          ? "/documents/legacy"
          : kind === "connected_accounts"
            ? "/accounts"
            : kind === "private_documents"
              ? "/documents"
              : "/documents",
      ctaLabel:
        kind === "digital_legacy"
          ? "Open Digital Legacy"
          : kind === "connected_accounts"
            ? "Open Connected Accounts"
            : kind === "emergency_access"
              ? "Open emergency settings"
              : "Open Documents",
      betaMode,
    };
  }

  const upgradeNote = betaMode
    ? `${featureLabel} is part of Legacy+. You’ll need Legacy+ to use it — switch plans on Billing (free during beta; no payment is collected).`
    : `${featureLabel} is part of Legacy+. You’ll need to upgrade to use it — open Plan / Billing when you’re ready.`;

  return {
    hasAccess: false,
    featureLabel,
    upgradeNote,
    href: "/billing",
    ctaLabel: betaMode
      ? "Switch to Legacy+ (free in beta)"
      : "View plans on Billing",
    betaMode,
  };
}

export async function resolveLegacyPlusGuidance(
  userId: string,
  kind: LegacyPlusFeatureKind = "legacy_plus_bundle",
): Promise<LegacyPlusGuidance> {
  const gate = await canUseLegacyPlusFeatures(userId);
  return buildLegacyPlusGuidance({
    hasAccess: gate.allowed,
    kind,
    betaMode: isBetaPlanModeActive(),
  });
}

export function featuresIncludeLegacyPlus(features: PlanFeatures): boolean {
  return hasLegacyPlusFeatures(features);
}

/** Short Ava-style sentence for a single feature. */
export function avaLegacyPlusUpgradeBlurb(
  kind: LegacyPlusFeatureKind,
  betaMode = isBetaPlanModeActive(),
): string {
  const label = FEATURE_LABELS[kind];
  if (betaMode) {
    return `${label} is part of Legacy+. I can show you Plan / Billing so you can switch for free during beta — no payment is collected.`;
  }
  return `${label} is part of Legacy+. You’ll need to upgrade to use it — Plan / Billing is the place to do that.`;
}
