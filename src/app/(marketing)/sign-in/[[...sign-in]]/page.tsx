import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
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

function isAuthHandshakePath(pathname: string): boolean {
  return /\/(sso-callback|verify)(\/|$)/i.test(pathname);
}

/**
 * Deep links are preserved by resolving `redirect_url` ourselves, then passing
 * that as forceRedirectUrl so Clerk always leaves auth for that destination.
 */
export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const landing = resolvePostAuthPath(params.redirect_url);

  const { userId, sessionStatus } = await auth();
  if (userId && sessionStatus !== "pending") {
    redirect(landing);
  }

  const pathname = (await headers()).get("x-pathname")?.trim() || "/sign-in";
  const handshake = isAuthHandshakePath(pathname);

  const widget = handshake ? (
    <SignIn
      forceRedirectUrl={landing}
      fallbackRedirectUrl={landing}
      appearance={authClerkAppearance}
    />
  ) : (
    <AuthClerkMount>
      <SignIn
        forceRedirectUrl={landing}
        fallbackRedirectUrl={landing}
        appearance={authClerkAppearance}
      />
    </AuthClerkMount>
  );

  return (
    <RedirectIfSignedIn redirectTo={landing} initialHandshake={handshake}>
      {handshake ? (
        widget
      ) : (
        <AuthPageShell
          eyebrow="Welcome back"
          title="Your family’s memories are waiting."
          support="Sign in to a calm, private vault — shared only with the people you choose."
        >
          <Suspense fallback={null}>
            <InactivitySignInNotice />
          </Suspense>
          {widget}
        </AuthPageShell>
      )}
    </RedirectIfSignedIn>
  );
}
