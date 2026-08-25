import { renderFirstFamilyMovieRitual } from "@/app/first-family-movie/render-ritual";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your First Family Movie — Family Memory Vault",
  description:
    "Welcome. Let’s make your first family movie together. It only takes a few minutes.",
};

type PageProps = {
  searchParams: Promise<{ movieId?: string; preview?: string }>;
};

/**
 * First-session welcome + guided upload.
 * Local preview: `/first-family-movie?preview=1` or `/first-family-movie/preview`
 */
export default async function FirstFamilyMoviePage({ searchParams }: PageProps) {
  const params = await searchParams;
  return renderFirstFamilyMovieRitual({ params });
}
