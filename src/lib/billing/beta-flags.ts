/**
 * Beta billing override — free plan switching with no Stripe charges.
 *
 * UNDO FOR LAUNCH:
 * 1. Set NEXT_PUBLIC_BETA_PLAN_PICKER=false and BETA_BILLING_OVERRIDE=false, redeploy.
 *    (Leaving them unset while NEXT_PUBLIC_ENABLE_BETA_FEEDBACK=true keeps beta plans on.)
 * 2. Checkout / portal resume normal paid flow; beta-assign API returns 404.
 * 3. Existing beta assignments keep their plan_id until you convert or reset:
 *    UPDATE subscriptions SET plan_id = (SELECT id FROM plans WHERE slug = 'free'),
 *      plan_source = 'free', billing_interval = 'none'
 *    WHERE plan_source = 'beta';
 * See BILLING.md § Beta plan testing.
 */

function truthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Explicit true/false; null when unset / unrecognized. */
function triState(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return null;
}

/**
 * Client UI: show beta plan picker / non-charge CTAs.
 * Must be NEXT_PUBLIC_* so the browser bundle can read it.
 *
 * Enabled when:
 * - NEXT_PUBLIC_BETA_PLAN_PICKER is explicitly true, OR
 * - unset and NEXT_PUBLIC_ENABLE_BETA_FEEDBACK is true (product beta)
 * Explicit false always disables.
 */
export function isBetaPlanPickerEnabled(): boolean {
  const explicit = triState(process.env.NEXT_PUBLIC_BETA_PLAN_PICKER);
  if (explicit !== null) return explicit;
  return truthy(process.env.NEXT_PUBLIC_ENABLE_BETA_FEEDBACK);
}

/**
 * Server authority: allow DB plan assign without Stripe; block Checkout charges.
 * Honors BETA_BILLING_OVERRIDE (explicit), else follows the plan-picker flag.
 */
export function isBetaBillingOverride(): boolean {
  const explicit = triState(process.env.BETA_BILLING_OVERRIDE);
  if (explicit !== null) return explicit;
  return isBetaPlanPickerEnabled();
}

/** Shared badge / banner copy for billing surfaces. */
export const BETA_PLAN_BADGE = "Beta testing — plans are free to try";

export function betaPlanSuccessMessage(planName: string): string {
  return `You’re now on the ${planName} plan for beta testing. No payment will be taken.`;
}
