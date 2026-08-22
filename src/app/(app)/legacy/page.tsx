import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegacyPlusLockedPage } from "@/components/billing/LegacyPlusLockedPage";
import { LegacyPlanningBoard } from "@/components/legacy/LegacyPlanningBoard";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { listPrivateDocuments } from "@/lib/documents";
import { getTranslations } from "@/lib/i18n/server";
import {
  loadPlanningScore,
  serializePlanningBoard,
} from "@/lib/legacy/planning";
import { serializeLegacyDocumentOption } from "@/lib/legacy/serialize";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

export default async function LegacyPlanningPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) redirect("/");

  await ensureAppUser(userId);
  const gate = await canUseLegacyPlusFeatures(userId);
  if (!gate.allowed) {
    return <LegacyPlusLockedPage featureLabel="Digital Legacy" gate={gate} />;
  }

  const t = await getTranslations();

  const [{ score, items }, documents] = await Promise.all([
    loadPlanningScore(userId),
    listPrivateDocuments(userId, { limit: 200 }),
  ]);

  return (
    <>
      <AppPageIntro
        slot="legacy"
        title={
          <>
            {t("pages.legacyPlanTitle")}{" "}
            <HintTooltip
              tip={t("tips.digitalLegacy")}
              label={t("pages.legacyAbout")}
            />
          </>
        }
        description={t("pages.legacyPlanDescription")}
      />

      <div className="app-page mx-auto max-w-3xl pb-16">
        <LegacyPlanningBoard
          initialBoard={serializePlanningBoard(score, items)}
          documentOptions={documents.map(serializeLegacyDocumentOption)}
        />
      </div>
    </>
  );
}
