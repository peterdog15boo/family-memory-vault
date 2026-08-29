import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyPlusLockedPage } from "@/components/billing/LegacyPlusLockedPage";
import { WillPlannerWorkspace } from "@/components/will-planner/WillPlannerWorkspace";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import {
  getActiveWillDraft,
  getOwnedWillDraft,
  hasAcceptedWillDisclaimer,
  listWillDraftsForOwner,
  serializeWillDraft,
  serializeWillDraftSummary,
} from "@/lib/will-planner/server";
import type { WillPlannerView } from "@/components/will-planner/WillPlannerWorkspace";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

type WillPlannerPageProps = {
  searchParams: Promise<{
    draft?: string;
    view?: string;
  }>;
};

export default async function WillPlannerPage({
  searchParams,
}: WillPlannerPageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const gate = await canUseLegacyPlusFeatures(userId);
  if (!gate.allowed) {
    return <LegacyPlusLockedPage featureLabel="Will Planner" gate={gate} />;
  }

  const params = await searchParams;
  const requestedId = params.draft?.trim() || null;
  const viewParam = params.view?.trim();

  const [active, disclaimerAccepted, drafts] = await Promise.all([
    getActiveWillDraft(userId),
    hasAcceptedWillDisclaimer(userId),
    listWillDraftsForOwner(userId),
  ]);

  let draft = active;
  if (requestedId) {
    const owned = await getOwnedWillDraft(userId, requestedId);
    if (owned) draft = owned;
  }

  let initialView: WillPlannerView = "hub";
  if (viewParam === "interview" || viewParam === "ready" || viewParam === "hub") {
    initialView = viewParam;
  } else if (draft?.status === "draft_ready" && draft.generatedMarkdown) {
    initialView = "ready";
  } else if (draft) {
    initialView = "hub";
  } else {
    initialView = "hub";
  }

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
          initialView={initialView}
        />
      </div>
    </>
  );
}
