/**
 * Build absolute family invite accept links (uses getAppUrl / NEXT_PUBLIC_APP_URL).
 * In development, optionally log the link for local testing when email is unset.
 */

import { getAppUrl } from "@/lib/env";

function appBaseUrl(): string {
  return getAppUrl();
}

/** Absolute accept URL for a pending invite token. */
export function buildFamilyInviteLink(inviteToken: string): string {
  const url = new URL("/family/accept", appBaseUrl());
  url.searchParams.set("token", inviteToken);
  return url.toString();
}

/**
 * Log the invite link in development for local debugging.
 * No-op in production — delivery is via Resend.
 */
export function logFamilyInviteLink(options: {
  familyId: string;
  email: string;
  inviteLink: string;
  memberId: string;
}): void {
  if (process.env.NODE_ENV === "production") return;

  console.info(
    [
      "[family.invite] Pending invite link (dev):",
      `  familyId: ${options.familyId}`,
      `  memberId: ${options.memberId}`,
      `  email:    ${options.email}`,
      `  link:     ${options.inviteLink}`,
    ].join("\n"),
  );
}
