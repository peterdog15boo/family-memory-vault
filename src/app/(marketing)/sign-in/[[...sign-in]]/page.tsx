import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { AuthClerkMount } from "@/components/auth/AuthClerkMount";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { InactivitySignInNotice } from "@/components/auth/InactivitySignInNotice";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";
import { authClerkAppearance } from "@/lib/auth/clerk-appearance";
import { resolvePostAuthPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ redirect_url?: string }>;
};

/**
 * Do not set forceRedirectUrl — it would ignore invite / deep-link
 * redirect_url query params (e.g. /family/accept?token=…).
 *
 * Signed-in visitors never paint the login shell: server redirect first,
 * then a client gate for the same-document post-auth race.
 */
export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const landing = resolvePostAuthPath(params.redirect_url);

  const { userId, sessionStatus } = await auth();
  if (userId && sessionStatus !== "pending") {
    redirect(landing);
  }

  return (
    <RedirectIfSignedIn redirectTo={landing}>
      <AuthPageShell
        eyebrow="Welcome back"
        title="Your family’s memories are waiting."
        support="Sign in to a calm, private vault — shared only with the people you choose."
      >
        <Suspense fallback={null}>
          <InactivitySignInNotice />
        </Suspense>
        <AuthClerkMount>
          <SignIn
            fallbackRedirectUrl={landing}
            appearance={authClerkAppearance}
          />
        </AuthClerkMount>
      </AuthPageShell>
    </RedirectIfSignedIn>
  );
}
