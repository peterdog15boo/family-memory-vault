/**
 * Shared Clerk auth for user-facing API routes.
 * Enforces authentication + blocks suspended accounts (layouts alone are not enough).
 * Optionally enforces Beta NDA acceptance when BETA_NDA_REQUIRED=true.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { cache } from "react";

export type ApiAuthOk = { ok: true; userId: string };
export type ApiAuthFail = { ok: false; response: NextResponse };
export type ApiAuthResult = ApiAuthOk | ApiAuthFail;

export type RequireApiUserOptions = {
  /** Skip Beta NDA gate (for the accept endpoint itself). */
  skipBetaNda?: boolean;
};

const checkSuspendedCached = cache(async (userId: string): Promise<boolean> => {
  const { isUserSuspended } = await import("@/lib/admin/users");
  return isUserSuspended(userId);
});

const checkBetaNdaCached = cache(async (userId: string): Promise<boolean> => {
  const { hasAcceptedBetaNda, isBetaNdaRequired } = await import(
    "@/lib/beta-nda"
  );
  if (!isBetaNdaRequired()) return true;
  return hasAcceptedBetaNda(userId);
});

/**
 * Require a signed-in, non-suspended Clerk user.
 * Use this (or domain wrappers that call it) on every user API route.
 */
export async function requireApiUser(
  options: RequireApiUserOptions = {},
): Promise<ApiAuthResult> {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    if (await checkSuspendedCached(userId)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Account suspended", code: "account_suspended" },
          { status: 403 },
        ),
      };
    }
  } catch (error) {
    // Fail closed — do not serve APIs if we cannot verify suspension status.
    console.error("[auth.api] suspend check failed", error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unable to verify account status" },
        { status: 503 },
      ),
    };
  }

  if (!options.skipBetaNda) {
    try {
      if (!(await checkBetaNdaCached(userId))) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: "Beta NDA acceptance required",
              code: "beta_nda_required",
            },
            { status: 403 },
          ),
        };
      }
    } catch (error) {
      console.error("[auth.api] beta NDA check failed", error);
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Unable to verify beta agreement status" },
          { status: 503 },
        ),
      };
    }
  }

  return { ok: true, userId };
}
