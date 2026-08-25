import { redirect } from "next/navigation";
import { LEGAL_AGREE_PATH } from "@/lib/legal-agree/gate";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ redirect_url?: string; redirectTo?: string }>;
};

/**
 * Legacy Beta NDA route — permanently redirected to the combined legal gate.
 */
export default async function BetaAgreeRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = params.redirect_url || params.redirectTo;
  if (next?.startsWith("/") && !next.startsWith("//")) {
    redirect(
      `${LEGAL_AGREE_PATH}?redirect_url=${encodeURIComponent(next)}`,
    );
  }
  redirect(LEGAL_AGREE_PATH);
}
