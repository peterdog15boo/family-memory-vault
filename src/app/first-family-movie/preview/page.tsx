import { renderFirstFamilyMovieRitual } from "@/app/first-family-movie/render-ritual";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "First Family Movie Preview — Family Memory Vault",
  description: "Local-only preview of the first-session welcome ritual.",
};

type PageProps = {
  searchParams: Promise<{ movieId?: string; preview?: string }>;
};

/**
 * Dedicated local preview URL — no query string required.
 * http://localhost:3000/first-family-movie/preview
 */
export default async function FirstFamilyMoviePreviewPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  return renderFirstFamilyMovieRitual({ params, forcePreview: true });
}
