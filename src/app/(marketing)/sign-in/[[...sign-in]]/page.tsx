import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { AuthClerkMount } from "@/components/auth/AuthClerkMount";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { InactivitySignInNotice } from "@/components/auth/InactivitySignInNotice";
import { authClerkAppearance } from "@/lib/auth/clerk-appearance";
import { getPostAuthLandingPath } from "@/lib/routes";

/**
 * Do not set forceRedirectUrl — it would ignore invite / deep-link
 * redirect_url query params (e.g. /family/accept?token=…).
 */
export default function SignInPage() {
  const landing = getPostAuthLandingPath();
  return (
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
  );
}
