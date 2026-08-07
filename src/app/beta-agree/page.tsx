import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { BetaNdaAgreeForm } from "@/components/beta/BetaNdaAgreeForm";
import {
  hasAcceptedBetaNda,
  isBetaNdaRequired,
} from "@/lib/beta-nda";
import { isUserSuspended } from "@/lib/admin/users";
import { ensureAppUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Beta Tester Agreement — Family Memory Vault",
  description:
    "Review and accept the Beta Tester Non-Disclosure Agreement to continue.",
};

type PageProps = {
  searchParams: Promise<{ redirect_url?: string; redirectTo?: string }>;
};

function safeRedirect(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/beta-agree")) return "/dashboard";
  return raw;
}

/**
 * Clickwrap gate for temporary beta NDA acceptance.
 * Outside (app) so DashboardShell does not wrap it.
 */
export default async function BetaAgreePage({ searchParams }: PageProps) {
  if (!isBetaNdaRequired()) {
    redirect("/dashboard");
  }

  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    const params = await searchParams;
    const next = safeRedirect(params.redirect_url || params.redirectTo);
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/beta-agree?redirect_url=${encodeURIComponent(next)}`)}`,
    );
  }

  if (await isUserSuspended(userId)) {
    redirect("/suspended");
  }

  try {
    await ensureAppUser(userId);
  } catch (error) {
    console.warn("[beta-agree] ensureAppUser failed", error);
  }

  if (await hasAcceptedBetaNda(userId)) {
    const params = await searchParams;
    redirect(safeRedirect(params.redirect_url || params.redirectTo));
  }

  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect_url || params.redirectTo);

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
      <BetaNdaAgreeForm
        initialFullName={initialFullName}
        initialEmail={initialEmail}
        redirectTo={redirectTo}
      />
    </main>
  );
}
