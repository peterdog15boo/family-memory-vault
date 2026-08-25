import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LegalAgreeForm } from "@/components/legal/LegalAgreeForm";
import { isUserSuspended } from "@/lib/admin/users";
import { hasAcceptedBetaNda, isBetaNdaRequired } from "@/lib/beta-nda";
import { shouldEnterFirstFamilyMovie } from "@/lib/first-family-movie";
import {
  isAnyLegalAgreementRequired,
  LEGAL_AGREE_PATH,
} from "@/lib/legal-agree/gate";
import { hasAcceptedTerms, isTermsRequired } from "@/lib/terms";
import {
  APP_HOME_PATH,
  FIRST_FAMILY_MOVIE_PATH,
  getPostAuthLandingPath,
} from "@/lib/routes";
import { ensureAppUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agreements — Family Memory Vault",
  description:
    "Review and accept the Beta Tester Agreement and Terms of Service to continue.",
};

type PageProps = {
  searchParams: Promise<{ redirect_url?: string; redirectTo?: string }>;
};

function safeRedirect(raw: string | undefined): string {
  const fallback = APP_HOME_PATH;
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (
    raw.startsWith(LEGAL_AGREE_PATH) ||
    raw.startsWith("/beta-agree") ||
    raw.startsWith("/terms-agree") ||
    raw.startsWith(FIRST_FAMILY_MOVIE_PATH) ||
    raw.startsWith("/sign-in") ||
    raw.startsWith("/sign-up")
  ) {
    return fallback;
  }
  return raw;
}

/**
 * Combined clickwrap after the First Family Movie ritual (when eligible).
 * Outside (app) so DashboardShell does not wrap it.
 */
export default async function LegalAgreePage({ searchParams }: PageProps) {
  if (!isAnyLegalAgreementRequired()) {
    redirect(getPostAuthLandingPath());
  }

  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    const params = await searchParams;
    const next = safeRedirect(params.redirect_url || params.redirectTo);
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`${LEGAL_AGREE_PATH}?redirect_url=${encodeURIComponent(next)}`)}`,
    );
  }

  if (await isUserSuspended(userId)) {
    redirect("/suspended");
  }

  try {
    await ensureAppUser(userId);
  } catch (error) {
    console.warn("[legal-agree] ensureAppUser failed", error);
  }

  // Ritual first: do not show legal until the welcome flow is done / skipped.
  if (await shouldEnterFirstFamilyMovie(userId)) {
    redirect(FIRST_FAMILY_MOVIE_PATH);
  }

  const requireNda =
    isBetaNdaRequired() && !(await hasAcceptedBetaNda(userId));
  const requireTerms =
    isTermsRequired() && !(await hasAcceptedTerms(userId));

  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect_url || params.redirectTo);

  if (!requireNda && !requireTerms) {
    redirect(redirectTo);
  }

  let initialFullName = "";
  let initialEmail = "";
  try {
    const user = await currentUser();
    initialFullName =
      user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      "";
    initialEmail = user?.primaryEmailAddress?.emailAddress || "";
  } catch {
    // Prefill is optional.
  }

  return (
    <main className="beta-nda-shell">
      <LegalAgreeForm
        initialFullName={initialFullName}
        initialEmail={initialEmail}
        redirectTo={redirectTo}
        requireNda={requireNda}
        requireTerms={requireTerms}
      />
    </main>
  );
}
