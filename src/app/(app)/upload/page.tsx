import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { StorageUsageCard } from "@/components/billing/StorageUsageCard";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { MediaUploader } from "@/components/upload/MediaUploader";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import { getTranslations } from "@/lib/i18n/server";

export default async function UploadPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const [usage, t] = await Promise.all([
    getAccountUsageSummary(userId),
    getTranslations(),
  ]);
  const storageBlocked = usage.storageMeter.level === "critical";

  return (
    <>
      <AppPageIntro
        slot="upload"
        eyebrow={t("uploadPage.eyebrow")}
        compact
        title={t("uploadPage.title")}
        description={t("uploadPage.description")}
      />

      <div className="app-page mx-auto max-w-3xl">
        <div className="space-y-3">
          <UsageLimitBanner summary={usage} />
          <StorageUsageCard snapshot={usage.storage} variant="compact" />
        </div>

        {storageBlocked ? (
          <div className="mt-6">
            <UpgradePrompt
              variant="blocked"
              message={t("uploadPage.storageFull", { plan: usage.planName })}
              hint={t("uploadPage.storageFullHint")}
              ctaLabel={t("uploadPage.upgradeStorage")}
            />
          </div>
        ) : null}

        <div className="mt-8">
          <MediaUploader
            storageBlocked={storageBlocked}
            planName={usage.planName}
          />
        </div>
      </div>
    </>
  );
}
