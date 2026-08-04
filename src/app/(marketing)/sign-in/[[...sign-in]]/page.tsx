import { SignIn } from "@clerk/nextjs";
import { AuthClerkMount } from "@/components/auth/AuthClerkMount";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { authClerkAppearance } from "@/lib/auth/clerk-appearance";

/**
 * Do not set forceRedirectUrl — it would ignore invite / deep-link
 * redirect_url query params (e.g. /family/accept?token=…).
 */
export default function SignInPage() {
  return (
    <AuthPageShell
      eyebrow="Welcome back"
      title="Your family’s memories are waiting."
      support="Sign in to a calm, private vault — shared only with the people you choose."
    >
      <AuthClerkMount>
        <SignIn
          fallbackRedirectUrl="/dashboard"
          appearance={authClerkAppearance}
        />
      </AuthClerkMount>
    </AuthPageShell>
  );
}
