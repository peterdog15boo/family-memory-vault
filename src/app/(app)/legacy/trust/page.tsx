import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyPlusLockedPage } from "@/components/billing/LegacyPlusLockedPage";
import { TrustPlannerWorkspace } from "@/components/trust-planner/TrustPlannerWorkspace";
import type { TrustPlannerView } from "@/components/trust-planner/TrustPlannerWorkspace";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import {
  getActiveTrustDraft,
  getOwnedTrustDraft,
  hasAcceptedTrustDisclaimer,
  listTrustDraftsForOwner,
  serializeTrustDraft,
  serializeTrustDraftSummary,
} from "@/lib/trust-planner/server";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

type TrustPlannerPageProps = {
  searchParams: Promise<{
    draft?: string;
    view?: string;
  }>;
};

export default async function TrustPlannerPage({
  searchParams,
}: TrustPlannerPageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const gate = await canUseLegacyPlusFeatures(userId);
  if (!gate.allowed) {
    return (
      <LegacyPlusLockedPage featureLabel="Living Trust Planner" gate={gate} />
    );
  }

  const params = await searchParams;
  const requestedId = params.draft?.trim() || null;
  const viewParam = params.view?.trim();

  const [active, disclaimerAccepted, drafts] = await Promise.all([
    getActiveTrustDraft(userId),
    hasAcceptedTrustDisclaimer(userId),
    listTrustDraftsForOwner(userId),
  ]);

  let draft = active;
  if (requestedId) {
    const owned = await getOwnedTrustDraft(userId, requestedId);
    if (owned) draft = owned;
  }

  let initialView: TrustPlannerView = "hub";
  if (
    viewParam === "interview" ||
    viewParam === "ready" ||
    viewParam === "hub"
  ) {
    initialView = viewParam;
  } else if (draft?.status === "draft_ready" && draft.generatedMarkdown) {
    initialView = "ready";
  } else if (draft) {
    initialView = "hub";
  }

  return (
    <>
      <AppPageIntro
        slot="legacy"
        title="Living trust planner"
        description="A guided interview that builds a planning draft for an attorney to review — not a legally effective trust. Funding (retitling assets) is separate and essential."
      />

      <div className="app-page legacy-vault mx-auto max-w-4xl pb-16">
        <TrustPlannerWorkspace
          initialDisclaimerAccepted={disclaimerAccepted}
          initialDraft={draft ? serializeTrustDraft(draft) : null}
          initialDrafts={drafts.map(serializeTrustDraftSummary)}
          initialView={initialView}
        />
      </div>
    </>
  );
}
