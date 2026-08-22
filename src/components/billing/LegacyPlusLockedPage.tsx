import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import {
  BETA_PLAN_BADGE,
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import type { PlanGateResult } from "@/lib/plans/gates";

type LegacyPlusLockedPageProps = {
  featureLabel: string;
  gate: PlanGateResult;
  tip?: string;
};

/**
 * Shown on Documents / Digital Legacy / Connected Accounts when the user’s
 * plan does not include Legacy+ tools.
 */
export function LegacyPlusLockedPage({
  featureLabel,
  gate,
  tip,
}: LegacyPlusLockedPageProps) {
  const betaMode = isBetaPlanPickerEnabled() || isBetaBillingOverride();

  return (
    <>
      <AppPageIntro
        slot="billing"
        compact
        title={featureLabel}
        description={
          tip ??
          (betaMode
            ? `${featureLabel} is part of Legacy+. ${BETA_PLAN_BADGE}.`
            : `${featureLabel} is included on the Legacy+ plan.`)
        }
      />
      <div className="app-page mx-auto max-w-xl">
        <UpgradePrompt
          title={`${featureLabel} is on Legacy+`}
          message={
            gate.reason ??
            `${featureLabel} is available on Legacy+, not on your current ${gate.planName} plan.`
          }
          hint={
            betaMode
              ? "Open Billing, choose Legacy+, and unlock this vault immediately — no payment is collected in beta."
              : (gate.upgradeHint ??
                "View plans to upgrade to Legacy+ and unlock Private Documents, Digital Legacy, and Connected Accounts.")
          }
          href={betaMode ? "/billing" : "/pricing"}
          ctaLabel={
            betaMode ? "Switch to Legacy+ (free in beta)" : "View plans"
          }
          secondaryHref={betaMode ? "/pricing" : "/billing"}
          secondaryCtaLabel={betaMode ? "Compare plan details" : "See usage"}
          variant="upgrade"
        />
      </div>
    </>
  );
}
