"use client";

import { SignIn } from "@clerk/nextjs";
import { PasskeySignInButton } from "@/components/auth/PasskeySignInButton";
import { authClerkAppearance } from "@/lib/auth/clerk-appearance";

type SignInPanelProps = {
  landing: string;
};

/**
 * Google + email via Clerk prebuilt SignIn, plus a feature-detected passkey
 * button. Clerk’s built-in “use passkey” card action is hidden to avoid a
 * duplicate control.
 */
export function SignInPanel({ landing }: SignInPanelProps) {
  return (
    <div className="auth-sign-in-panel w-full">
      <PasskeySignInButton redirectUrl={landing} />
      <SignIn
        forceRedirectUrl={landing}
        fallbackRedirectUrl={landing}
        appearance={authClerkAppearance}
      />
    </div>
  );
}
