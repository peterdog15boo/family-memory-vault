/**
 * Plan-based idle timeout policy.
 * Free: always on, cannot disable (UI/API/local storage).
 * Paid: defaults on; may disable and persist in account preferences.
 */

import { isPaidPublicPlan } from "@/lib/plans/pricing-display";

export type IdleTimeoutPolicy = {
  /** Effective: whether the client must run idle logout. */
  enabled: boolean;
  /** Stored preference (ignored for free). */
  preferenceEnabled: boolean;
  /** Whether the user may turn it off (paid plans only). */
  canDisable: boolean;
  planSlug: string;
};

export function canDisableIdleTimeout(planSlug: string): boolean {
  return isPaidPublicPlan(planSlug as "free" | "family" | "family_plus");
}

/**
 * Free always returns true. Paid uses stored preference (default ON).
 */
export function resolveEffectiveIdleTimeoutEnabled(
  preferenceEnabled: boolean | undefined,
  planSlug: string,
): boolean {
  if (!canDisableIdleTimeout(planSlug)) return true;
  return preferenceEnabled !== false;
}

export function buildIdleTimeoutPolicy(input: {
  preferenceEnabled?: boolean;
  planSlug: string;
}): IdleTimeoutPolicy {
  const preferenceEnabled = input.preferenceEnabled !== false;
  const canDisable = canDisableIdleTimeout(input.planSlug);
  return {
    preferenceEnabled,
    canDisable,
    enabled: resolveEffectiveIdleTimeoutEnabled(
      preferenceEnabled,
      input.planSlug,
    ),
    planSlug: input.planSlug,
  };
}
