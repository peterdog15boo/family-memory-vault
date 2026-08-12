import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { PhotosJourneyTrack } from "@/components/gamification/PhotosJourneyTrack";
import { PaginatedMediaLibrary } from "@/components/media/PaginatedMediaLibrary";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { getTranslations } from "@/lib/i18n/server";
import {
  getSafeMediaLibrary,
  MEDIA_LIBRARY_INITIAL_SIZE,
  MEDIA_PAGE_SIZE,
} from "@/lib/media/queries";
import { serializeSafeMediaItem } from "@/lib/memories";
import {
  emptyJourneySnapshot,
  getUserJourney,
  photosSnapshotFromJourney,
} from "@/lib/gamification";

/**
 * Full clean media library — own uploads plus family-shared clean media.
 * First page is server-rendered; further pages load via /api/media/library.
 */
export default async function MediaLibraryPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const t = await getTranslations();
  const journey = await getUserJourney(userId).catch(() => null);
  const photosJourney = journey
    ? photosSnapshotFromJourney(journey)
    : emptyJourneySnapshot("photos");

  let library;
  try {
    library = await getSafeMediaLibrary(userId, {
      ownLimit: MEDIA_LIBRARY_INITIAL_SIZE,
      sharedLimit: MEDIA_LIBRARY_INITIAL_SIZE,
    });
  } catch (error) {
    console.error("[media.page] getSafeMediaLibrary failed", error);
    throw error;
  }
  const own = library.own.map(serializeSafeMediaItem);
  const shared = library.shared.map(serializeSafeMediaItem);

  return (
    <>
      <AppPageIntro
        slot="media"
        eyebrow={t("pages.mediaEyebrow")}
        title={
          <>
            {t("pages.mediaTitle")}{" "}
            <HintTooltip tip={t("tips.moderation")} label={t("pages.mediaReadiness")} />
          </>
        }
        description={t("pages.mediaDescription")}
        actions={
          <Link href="/upload" className="ui-btn ui-btn-primary ui-btn-lg">
            <Upload className="size-4" aria-hidden />
            {t("pages.mediaAdd")}
          </Link>
        }
      />

      <div className="app-page app-page--media app-stack mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t("pages.backToVault")}
        </Link>

        <PhotosJourneyTrack initial={photosJourney} />

        <PaginatedMediaLibrary
          initialOwn={own}
          initialShared={shared}
          hasFamilySharing={library.hasFamilySharing}
          ownHasMore={library.ownHasMore}
          sharedHasMore={library.sharedHasMore}
          pageSize={MEDIA_PAGE_SIZE}
        />
      </div>
    </>
  );
}
