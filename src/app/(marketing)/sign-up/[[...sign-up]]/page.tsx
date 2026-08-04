import { SignUp } from "@clerk/nextjs";
import { AuthClerkMount } from "@/components/auth/AuthClerkMount";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { authClerkAppearance } from "@/lib/auth/clerk-appearance";

/**
 * Do not set forceRedirectUrl — preserves redirect_url deep links after signup.
 */
export default function SignUpPage() {
  return (
    <AuthPageShell
      eyebrow="Begin your vault"
      title="A private home for what love leaves behind."
      support="Create your account and start gathering photos, stories, and keepsakes — safely."
    >
      <AuthClerkMount>
        <SignUp
          fallbackRedirectUrl="/dashboard"
          appearance={authClerkAppearance}
        />
      </AuthClerkMount>
    </AuthPageShell>
  );
}
