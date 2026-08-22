import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OnThisDayView } from "@/components/on-this-day/OnThisDayView";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getTranslations } from "@/lib/i18n/server";
import { getOnThisDayForUser } from "@/lib/media/on-this-day";

/**
 * On This Day — moments from this month/day in prior years.
 * Only clean/ready media the viewer can access.
 */
export default async function OnThisDayPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const [t, result] = await Promise.all([
    getTranslations(),
    getOnThisDayForUser(userId),
  ]);

  return (
    <>
      <AppPageIntro
        slot="media"
        eyebrow={t("onThisDay.eyebrow")}
        title={t("onThisDay.title", { date: result.label })}
        description={t("onThisDay.description")}
      />

      <div className="app-page mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t("pages.backToVault")}
        </Link>

        <div className="mt-6">
          <OnThisDayView
            label={result.label}
            items={result.items}
            years={result.years}
          />
        </div>
      </div>
    </>
  );
}
