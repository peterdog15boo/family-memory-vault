import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
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
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
            <h2 className="font-display text-lg text-[color:var(--legacy-ink)]">
              Will planner
            </h2>
            <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
              Build a plain-language attorney draft from a guided interview. This
              is a planning draft only — not a will.
            </p>
            <Link
              href="/legacy/will"
              className="ui-btn ui-btn-primary mt-4 inline-flex"
            >
              Start will planner
            </Link>
          </div>

          <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
            <h2 className="font-display text-lg text-[color:var(--legacy-ink)]">
              Living trust planner
            </h2>
            <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
              Plan a revocable living trust outline for your attorney — including
              funding reminders. Not a signed trust.
            </p>
            <Link
              href="/legacy/trust"
              className="ui-btn ui-btn-primary mt-4 inline-flex"
            >
              Start trust planner
            </Link>
          </div>
        </div>

        <LegacyPlanningBoard
          initialBoard={serializePlanningBoard(score, items)}
          documentOptions={documents.map(serializeLegacyDocumentOption)}
        />
      </div>
    </>
  );
}
