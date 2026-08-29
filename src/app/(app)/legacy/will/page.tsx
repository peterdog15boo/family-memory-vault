import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyPlusLockedPage } from "@/components/billing/LegacyPlusLockedPage";
import { WillPlannerWorkspace } from "@/components/will-planner/WillPlannerWorkspace";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import {
  getActiveWillDraft,
  hasAcceptedWillDisclaimer,
  listWillDraftsForOwner,
  serializeWillDraft,
  serializeWillDraftSummary,
} from "@/lib/will-planner/server";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

export default async function WillPlannerPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const gate = await canUseLegacyPlusFeatures(userId);
  if (!gate.allowed) {
    return <LegacyPlusLockedPage featureLabel="Will Planner" gate={gate} />;
  }

  const [draft, disclaimerAccepted, drafts] = await Promise.all([
    getActiveWillDraft(userId),
    hasAcceptedWillDisclaimer(userId),
    listWillDraftsForOwner(userId),
  ]);

  return (
    <>
      <AppPageIntro
        slot="legacy"
        title="Will planner"
        description="A guided interview that builds a planning draft for an attorney to review — not a legally effective will. Lives next to Digital Legacy; drafts stay owner-only."
      />

      <div className="app-page legacy-vault mx-auto max-w-4xl pb-16">
        <WillPlannerWorkspace
          initialDisclaimerAccepted={disclaimerAccepted}
          initialDraft={draft ? serializeWillDraft(draft) : null}
          initialDrafts={drafts.map(serializeWillDraftSummary)}
        />
      </div>
    </>
  );
}
