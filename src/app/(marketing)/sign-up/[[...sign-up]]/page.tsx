import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
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

function isAuthHandshakePath(pathname: string): boolean {
  return /\/(sso-callback|verify)(\/|$)/i.test(pathname);
}

/**
 * Deep links are preserved by resolving `redirect_url` ourselves, then passing
 * that as forceRedirectUrl so Clerk always leaves auth for that destination.
 */
export default async function SignUpPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const landing = resolvePostAuthPath(params.redirect_url);

  const { userId, sessionStatus } = await auth();
  if (userId && sessionStatus !== "pending") {
    redirect(landing);
  }

  const pathname = (await headers()).get("x-pathname")?.trim() || "/sign-up";
  const handshake = isAuthHandshakePath(pathname);

  const widget = handshake ? (
    <SignUp
      forceRedirectUrl={landing}
      fallbackRedirectUrl={landing}
      appearance={authClerkAppearance}
    />
  ) : (
    <AuthClerkMount>
      <SignUp
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
          eyebrow="Begin your vault"
          title="A private home for what love leaves behind."
          support="Create your account and start gathering photos, stories, and keepsakes — safely."
        >
          {widget}
        </AuthPageShell>
      )}
    </RedirectIfSignedIn>
  );
}
