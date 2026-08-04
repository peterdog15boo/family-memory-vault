import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { PaginatedMemoryLibrary } from "@/components/memories/PaginatedMemoryLibrary";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  listMemoryLibrary,
  serializeMemoryListItem,
} from "@/lib/memories";

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

  const params = searchParams ? await searchParams : {};
  const deletedNotice =
    params.deleted === "1"
      ? "Album deleted. Your photos are still saved."
      : null;

  const library = await listMemoryLibrary(userId);
  const own = library.own.map(serializeMemoryListItem);
  const shared = library.shared.map(serializeMemoryListItem);

  return (
    <>
      <AppPageIntro
        slot="memories"
        eyebrow="Albums & stories"
        title="Memories"
        description="Gather photos into albums you can revisit and share with family."
        actions={
          <Link href="/memories/new" className="ui-btn ui-btn-primary ui-btn-lg">
            <Plus className="size-4" aria-hidden />
            Create a memory
          </Link>
        }
      />

      <div className="app-page app-page--memories app-stack mx-auto max-w-6xl">
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
          Only clean, approved media can appear in a memory. Upload new photos
          from the Upload page when you&apos;re ready.
        </p>
      </div>
    </>
  );
}
