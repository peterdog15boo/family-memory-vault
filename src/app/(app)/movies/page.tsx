import Link from "next/link";
import { Film } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MovieLibrary } from "@/components/movies/MovieLibrary";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getTranslations } from "@/lib/i18n/server";
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

  const t = await getTranslations();

  const rows = await listUserMoviesWithMemory(userId, { limit: 48 });
  const movies = await Promise.all(
    rows.map((row) => serializeMovie(row, { includeUrls: true })),
  );

  return (
    <>
      <AppPageIntro
        slot="movies"
        eyebrow={t("pages.moviesEyebrow")}
        title={t("pages.moviesTitle")}
        description={t("pages.moviesDescription")}
        actions={
          <Link href="/memories" className="ui-btn ui-btn-primary ui-btn-lg">
            <Film className="size-4" aria-hidden />
            {t("pages.moviesMake")}
          </Link>
        }
      />

      <div className="app-page app-page--movies app-stack mx-auto max-w-6xl">
        <MovieLibrary
          initialMovies={movies}
          showMemoryLink
          emptyTitle={t("empty.moviesTitle")}
          emptyDescription={t("empty.moviesDescription")}
          emptyActionHref="/memories"
          emptyActionLabel={t("pages.browseMemories")}
        />
      </div>
    </>
  );
}
