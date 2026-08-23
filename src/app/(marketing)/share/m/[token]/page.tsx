import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Legacy share URLs → canonical /share/movies/[token].
 */
export default async function LegacySharedMovieRedirect({ params }: PageProps) {
  const { token } = await params;
  redirect(`/share/movies/${encodeURIComponent(token)}`);
}
