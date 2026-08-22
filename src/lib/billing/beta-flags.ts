/**
 * Beta billing override — free plan switching with no Stripe charges.
 *
 * UNDO FOR LAUNCH:
 * 1. Set BETA_BILLING_OVERRIDE=false and NEXT_PUBLIC_BETA_PLAN_PICKER=false, redeploy.
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

/**
 * Client UI: show beta plan picker / non-charge CTAs.
 * Must be NEXT_PUBLIC_* so the browser bundle can read it.
 */
export function isBetaPlanPickerEnabled(): boolean {
  return truthy(process.env.NEXT_PUBLIC_BETA_PLAN_PICKER);
}

/**
 * Server authority: allow DB plan assign without Stripe; block Checkout charges.
 * Honors BETA_BILLING_OVERRIDE or NEXT_PUBLIC_BETA_PLAN_PICKER (either enables).
 */
export function isBetaBillingOverride(): boolean {
  return (
    truthy(process.env.BETA_BILLING_OVERRIDE) ||
    truthy(process.env.NEXT_PUBLIC_BETA_PLAN_PICKER)
  );
}
