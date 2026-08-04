import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { PaginatedMediaLibrary } from "@/components/media/PaginatedMediaLibrary";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { COPY } from "@/lib/copy";
import {
  getSafeMediaLibrary,
  MEDIA_PAGE_SIZE,
} from "@/lib/media/queries";
import { serializeSafeMediaItem } from "@/lib/memories";

/**
 * Full clean media library — own uploads plus family-shared clean media.
 * First page is server-rendered; further pages load via /api/media/library.
 */
export default async function MediaLibraryPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const library = await getSafeMediaLibrary(userId, {
    ownLimit: MEDIA_PAGE_SIZE,
    sharedLimit: MEDIA_PAGE_SIZE,
  });
  const own = library.own.map(serializeSafeMediaItem);
  const shared = library.shared.map(serializeSafeMediaItem);

  return (
    <>
      <AppPageIntro
        slot="media"
        eyebrow="Your photos"
        title={
          <>
            Your photos{" "}
            <HintTooltip tip={COPY.tips.moderation} label="About photo readiness" />
          </>
        }
        description="Browse the photos and videos you’ve saved — ready for albums and movies."
        actions={
          <Link href="/upload" className="ui-btn ui-btn-primary ui-btn-lg">
            <Upload className="size-4" aria-hidden />
            Add photos
          </Link>
        }
      />

      <div className="app-page app-page--media app-stack mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to vault
        </Link>

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
