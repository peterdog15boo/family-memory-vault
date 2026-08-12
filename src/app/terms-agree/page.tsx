import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { TermsAgreeForm } from "@/components/legal/TermsAgreeForm";
import { isUserSuspended } from "@/lib/admin/users";
import { shouldRedirectToBetaNda } from "@/lib/beta-nda/gate";
import {
  hasAcceptedTerms,
  isTermsRequired,
} from "@/lib/terms";
import { ensureAppUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Terms of Service — Family Memory Vault",
  description:
    "Review and accept the Family Memory Vault Terms of Service to continue.",
};

type PageProps = {
  searchParams: Promise<{ redirect_url?: string; redirectTo?: string }>;
};

function safeRedirect(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/terms-agree")) return "/dashboard";
  if (raw.startsWith("/beta-agree")) return "/dashboard";
  if (raw.startsWith("/sign-in") || raw.startsWith("/sign-up")) {
    return "/dashboard";
  }
  return raw;
}

/**
 * Clickwrap gate for Terms of Service.
 * Shown after Beta NDA (when required). Outside (app) so DashboardShell
 * does not wrap it.
 */
export default async function TermsAgreePage({ searchParams }: PageProps) {
  if (!isTermsRequired()) {
    redirect("/dashboard");
  }

  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    const params = await searchParams;
    const next = safeRedirect(params.redirect_url || params.redirectTo);
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/terms-agree?redirect_url=${encodeURIComponent(next)}`)}`,
    );
  }

  if (await isUserSuspended(userId)) {
    redirect("/suspended");
  }

  try {
    await ensureAppUser(userId);
  } catch (error) {
    console.warn("[terms-agree] ensureAppUser failed", error);
  }

  // NDA first during beta.
  if (await shouldRedirectToBetaNda(userId)) {
    const params = await searchParams;
    const next = safeRedirect(params.redirect_url || params.redirectTo);
    redirect(
      `/beta-agree?redirect_url=${encodeURIComponent(`/terms-agree?redirect_url=${encodeURIComponent(next)}`)}`,
    );
  }

  if (await hasAcceptedTerms(userId)) {
    const params = await searchParams;
    redirect(safeRedirect(params.redirect_url || params.redirectTo));
  }

  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect_url || params.redirectTo);

  let displayName = "";
  let email = "";
  try {
    const user = await currentUser();
    displayName =
      user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.username ||
      "";
    email = user?.primaryEmailAddress?.emailAddress || "";
  } catch {
    // Prefill is optional.
  }

  return (
    <main className="beta-nda-shell">
      <TermsAgreeForm
        displayName={displayName}
        email={email}
        redirectTo={redirectTo}
      />
    </main>
  );
}
