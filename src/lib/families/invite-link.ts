/**
 * Build and (in development) log family invite links.
 * Production delivery goes through sendFamilyInviteEmail (see email/lifecycle).
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
 * Log the invite link in development so you can copy it without email.
 * No-op in production (email will be added later).
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
      "[family.invite] Pending invite (dev — copy this link):",
      `  familyId: ${options.familyId}`,
      `  memberId: ${options.memberId}`,
      `  email:    ${options.email}`,
      `  link:     ${options.inviteLink}`,
    ].join("\n"),
  );
}
