import Link from "next/link";
import { Film } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MovieLibrary } from "@/components/movies/MovieLibrary";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { COPY } from "@/lib/copy";
import { listUserMoviesWithMemory } from "@/lib/movies/list";
import { serializeMovie } from "@/lib/movies/serialize";

/**
 * Library of movies the user has generated from their memories.
 */
export default async function MoviesPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const rows = await listUserMoviesWithMemory(userId, { limit: 48 });
  const movies = await Promise.all(
    rows.map((row) => serializeMovie(row, { includeUrls: true })),
  );

  return (
    <>
      <AppPageIntro
        slot="movies"
        eyebrow="Short films"
        title="Movies"
        description="Watch the short films made from your memories — or open an album to make a new one."
        actions={
          <Link href="/memories" className="ui-btn ui-btn-primary ui-btn-lg">
            <Film className="size-4" aria-hidden />
            Make a movie
          </Link>
        }
      />

      <div className="app-page app-page--movies app-stack mx-auto max-w-6xl">
        <MovieLibrary
          initialMovies={movies}
          showMemoryLink
          emptyTitle={COPY.empty.movies.title}
          emptyDescription={COPY.empty.movies.description}
          emptyActionHref="/memories"
          emptyActionLabel="Browse memories"
        />
      </div>
    </>
  );
}
