import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import {
  BETA_PLAN_BADGE,
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import type { PlanGateResult } from "@/lib/plans/gates";

type FamilyTreeLockedPageProps = {
  gate: PlanGateResult;
};

/**
 * Shown when a Free (or otherwise ineligible) plan opens /family-tree.
 */
export function FamilyTreeLockedPage({ gate }: FamilyTreeLockedPageProps) {
  const betaMode = isBetaPlanPickerEnabled() || isBetaBillingOverride();

  return (
    <>
      <AppPageIntro
        slot="family"
        compact
        title="Family Tree"
        description={
          betaMode
            ? `Map the people you love into a living tree. Included on Family and Legacy+. ${BETA_PLAN_BADGE}.`
            : "Map the people you love into a living tree — included on Family and Legacy+."
        }
      />
      <div className="app-page mx-auto max-w-xl">
        <UpgradePrompt
          title="Family Tree is on Family & Legacy+"
          message={
            gate.reason ??
            `Family Tree isn’t included on your current ${gate.planName} plan.`
          }
          hint={
            betaMode
              ? "Open Billing, choose Family or Legacy+, and unlock the tree — no payment is collected in beta."
              : (gate.upgradeHint ??
                "Upgrade to Family to start building your family tree.")
          }
          href={betaMode ? "/billing" : "/pricing"}
          ctaLabel={betaMode ? "Choose a plan (free in beta)" : "View plans"}
          secondaryHref={betaMode ? "/pricing" : "/billing"}
          secondaryCtaLabel={betaMode ? "Compare plan details" : "See usage"}
          variant="upgrade"
        />
      </div>
    </>
  );
}
