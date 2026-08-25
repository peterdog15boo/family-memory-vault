import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { AuthClerkMount } from "@/components/auth/AuthClerkMount";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";
import { authClerkAppearance } from "@/lib/auth/clerk-appearance";
import { resolvePostAuthPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ redirect_url?: string }>;
};

/**
 * Do not set forceRedirectUrl — preserves redirect_url deep links after signup.
 *
 * Signed-in visitors never paint the sign-up shell (server + client gates).
 */
export default async function SignUpPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const landing = resolvePostAuthPath(params.redirect_url);

  const { userId, sessionStatus } = await auth();
  if (userId && sessionStatus !== "pending") {
    redirect(landing);
  }

  return (
    <RedirectIfSignedIn redirectTo={landing}>
      <AuthPageShell
        eyebrow="Begin your vault"
        title="A private home for what love leaves behind."
        support="Create your account and start gathering photos, stories, and keepsakes — safely."
      >
        <AuthClerkMount>
          <SignUp
            fallbackRedirectUrl={landing}
            appearance={authClerkAppearance}
          />
        </AuthClerkMount>
      </AuthPageShell>
    </RedirectIfSignedIn>
  );
}
