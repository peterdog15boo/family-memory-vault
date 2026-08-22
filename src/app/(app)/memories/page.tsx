import Link from "next/link";
import { Clapperboard, Plus, Shield } from "lucide-react";
import { PaginatedMemoryLibrary } from "@/components/memories/PaginatedMemoryLibrary";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  listMemoryLibrary,
  serializeMemoryListItem,
} from "@/lib/memories";
import { getTranslations } from "@/lib/i18n/server";
import { JourneyTrackCard } from "@/components/gamification/PhotosJourneyTrack";
import {
  emptyJourneySnapshot,
  getUserJourney,
  memoriesSnapshotFromJourney,
} from "@/lib/gamification";

type MemoriesPageProps = {
  searchParams?: Promise<{ deleted?: string }>;
};

/**
 * Memories library — own albums plus family-shared albums.
 * First page is server-rendered; further pages load via /api/memories/library.
 */
export default async function MemoriesPage({ searchParams }: MemoriesPageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const t = await getTranslations();
  const params = searchParams ? await searchParams : {};
  const deletedNotice =
    params.deleted === "1" ? t("memories.deletedNotice") : null;

  const journey = await getUserJourney(userId).catch(() => null);
  const memoriesJourney = journey
    ? memoriesSnapshotFromJourney(journey)
    : emptyJourneySnapshot("memories");

  const library = await listMemoryLibrary(userId);
  const own = library.own.map(serializeMemoryListItem);
  const shared = library.shared.map(serializeMemoryListItem);
  const makeMovieHref =
    own.length > 0
      ? `/memories/${own[0]!.id}?createMovie=1`
      : "/memories/new?intent=movie";

  return (
    <>
      <AppPageIntro
        slot="memories"
        eyebrow={t("memories.eyebrow")}
        title={t("memories.title")}
        description={t("memories.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={makeMovieHref} className="ui-btn ui-btn-secondary ui-btn-lg">
              <Clapperboard className="size-4" aria-hidden />
              {t("pages.moviesMake")}
            </Link>
            <Link href="/memories/new" className="ui-btn ui-btn-primary ui-btn-lg">
              <Plus className="size-4" aria-hidden />
              {t("pages.createMemory")}
            </Link>
          </div>
        }
      />

      <div className="app-page app-page--memories app-stack mx-auto max-w-6xl">
        <JourneyTrackCard initial={memoriesJourney} />

        <PaginatedMemoryLibrary
          initialOwn={own}
          initialShared={shared}
          hasFamilySharing={library.hasFamilySharing}
          ownHasMore={library.ownHasMore}
          sharedHasMore={library.sharedHasMore}
          initialNotice={deletedNotice}
        />

        <p className="mt-10 flex gap-2 text-xs leading-relaxed text-ink-muted">
          <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          {t("memories.safetyNote")}
        </p>
      </div>
    </>
  );
}
