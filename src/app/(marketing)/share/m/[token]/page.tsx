import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedMovieView } from "@/components/movies/SharedMovieView";
import {
  buildMovieSharePageUrl,
  buildMovieSharePosterUrl,
  lookupPublicMovieShare,
  resolvePublicMovieShare,
} from "@/lib/movies/public-share";

type PageProps = {
  params: Promise<{ token: string }>;
};

const SHARE_DESCRIPTION =
  "A short film made from family moments — shared with care on Family Memory Vault.";

/**
 * Strong Open Graph / Twitter cards so Facebook’s share dialog shows a real preview.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const row = await lookupPublicMovieShare(token);
  if (!row) {
    return {
      title: "Shared movie",
      robots: { index: false, follow: false },
    };
  }

  const title = row.movie.title?.trim() || "Family movie";
  const shareUrl = buildMovieSharePageUrl(row.share.token);
  const hasPoster = Boolean(row.movie.thumbnailKey?.trim());
  const posterUrl = hasPoster
    ? buildMovieSharePosterUrl(row.share.token)
    : undefined;

  return {
    title,
    description: SHARE_DESCRIPTION,
    robots: { index: false, follow: false },
    alternates: { canonical: shareUrl },
    openGraph: {
      title,
      description: SHARE_DESCRIPTION,
      url: shareUrl,
      type: "website",
      siteName: "Family Memory Vault",
      ...(posterUrl
        ? {
            images: [
              {
                url: posterUrl,
                alt: title,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: posterUrl ? "summary_large_image" : "summary",
      title,
      description: SHARE_DESCRIPTION,
      ...(posterUrl ? { images: [posterUrl] } : {}),
    },
  };
}

/**
 * Public shared movie page — emotional, simple, signup CTA.
 * Only the shared movie is exposed (no private library).
 */
export default async function SharedMoviePage({ params }: PageProps) {
  const { token } = await params;
  const resolved = await resolvePublicMovieShare(token);
  if (!resolved) {
    notFound();
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#1a1410] text-[#f7f0e8]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(196,140,90,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(80,50,30,0.45),_transparent_60%)]"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 text-center sm:mb-10">
          <p className="font-display text-sm tracking-[0.18em] text-[#e8c9a4] uppercase">
            Family Memory Vault
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
            {resolved.movie.title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[#f7f0e8]/80">
            A short film made from family moments — shared with care.
          </p>
        </header>

        <SharedMovieView movie={resolved.movie} />

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center backdrop-blur-sm sm:mt-12 sm:px-8 sm:py-8">
          <h2 className="font-display text-2xl tracking-tight">
            Keep your family’s stories safe
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#f7f0e8]/75">
            Start a private vault for photos, memories, and movies you’ll want
            for years — not just this weekend.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#e8c9a4] px-6 text-sm font-medium text-[#1a1410] transition hover:bg-[#f0d7b8]"
            >
              Start your family vault
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 px-5 text-sm text-[#f7f0e8]/90 transition hover:border-white/40"
            >
              Sign in
            </Link>
          </div>
        </section>

        <p className="mt-auto pt-10 text-center text-xs text-[#f7f0e8]/45">
          Shared movies show only this film — never someone’s private library.
        </p>
      </div>
    </main>
  );
}
