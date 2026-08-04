import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { StorageUsageCard } from "@/components/billing/StorageUsageCard";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { MediaUploader } from "@/components/upload/MediaUploader";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";

export default async function UploadPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const usage = await getAccountUsageSummary(userId);
  const storageBlocked = usage.storageMeter.level === "critical";

  return (
    <>
      <AppPageIntro
        slot="upload"
        eyebrow="Add to your vault"
        compact
        title="Upload"
        description="Add photos and videos from your phone or computer. We’ll keep them private until they’re ready."
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
              message={`Your ${usage.planName} plan storage is full. Remove older photos from Photos, or upgrade for more space.`}
              hint="Your existing memories are safe — only new uploads are paused."
              ctaLabel="Upgrade for more storage"
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
