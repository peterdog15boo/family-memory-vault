import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { StorageUsageCard } from "@/components/billing/StorageUsageCard";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { UploadPageIntake } from "@/components/upload/UploadPageIntake";
import { PhotoRequestBanner } from "@/components/upload/PhotoRequestBanner";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import { getTranslations } from "@/lib/i18n/server";
import { getPhotoRequestForUpload } from "@/lib/photo-requests";

type PageProps = {
  searchParams?: Promise<{ request?: string }>;
};

export default async function UploadPage({ searchParams }: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : {};
  const requestToken = params.request?.trim() || null;

  const [usage, t, photoRequest] = await Promise.all([
    getAccountUsageSummary(userId),
    getTranslations(),
    requestToken
      ? getPhotoRequestForUpload(requestToken, userId)
      : Promise.resolve(null),
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

        {photoRequest ? (
          <div className="mt-6">
            <PhotoRequestBanner request={photoRequest} />
          </div>
        ) : null}

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
          <UploadPageIntake
            storageBlocked={storageBlocked}
            planName={usage.planName}
          />
        </div>
      </div>
    </>
  );
}
