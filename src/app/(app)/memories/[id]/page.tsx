import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { MemoryDetailView } from "@/components/memories/MemoryDetailView";
import { getUserFamilies } from "@/lib/families";
import { getSafeMediaLibrary } from "@/lib/media/queries";
import {
  getMemoryWithMedia,
  serializeMemoryWithMedia,
  serializeSafeMediaItem,
} from "@/lib/memories";
import { listUserMoviesWithMemory } from "@/lib/movies/list";
import { serializeMovie } from "@/lib/movies/serialize";
import { getPlanCapabilities } from "@/lib/plans/gates";
import { canEditMemory } from "@/lib/permissions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; createMovie?: string }>;
};

/**
 * Memory detail — owner, or family when explicitly shared.
 * Media shown here is always clean + ready.
 *
 * Action bar permissions are derived from ownership + canEditMemory, with
 * safe fallbacks so legacy rows (missing optional fields) still show the
 * same owner controls as newly created memories.
 */
export default async function MemoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const { id } = await params;
  const { edit, createMovie } = await searchParams;
  const memory = await getMemoryWithMedia(id, userId);
  if (!memory) {
    notFound();
  }

  const isOwner = memory.userId === userId;

  let canEdit = isOwner;
  try {
    canEdit = (await canEditMemory(userId, id)) || isOwner;
  } catch (error) {
    console.warn("[memories.detail] canEditMemory failed; using owner fallback", {
      memoryId: id,
      isOwner,
      error: error instanceof Error ? error.message : String(error),
    });
    canEdit = isOwner;
  }

  const [families, planCapabilities] = await Promise.all([
    getUserFamilies(userId),
    getPlanCapabilities(userId),
  ]);
  const hasFamily = families.length > 0;

  const library = isOwner
    ? (
        await getSafeMediaLibrary(userId, { ownLimit: 120, sharedLimit: 0 })
      ).own.map(serializeSafeMediaItem)
    : [];

  const movieRows = isOwner
    ? await listUserMoviesWithMemory(userId, { memoryId: id, limit: 24 })
    : [];
  const initialMovies = await Promise.all(
    movieRows.map((row) => serializeMovie(row, { includeUrls: true })),
  );

  return (
    <MemoryDetailView
      initialMemory={serializeMemoryWithMedia(memory)}
      library={library}
      initialMovies={initialMovies}
      planCapabilities={planCapabilities}
      canEdit={canEdit}
      canManageMedia={isOwner}
      canManageSharing={isOwner}
      hasFamily={hasFamily}
      startEditing={canEdit && edit === "1"}
      startCreateMovie={isOwner && createMovie === "1"}
    />
  );
}
