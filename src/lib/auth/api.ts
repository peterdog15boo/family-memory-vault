/**
 * Shared Clerk auth for user-facing API routes.
 * Enforces authentication + blocks suspended accounts (layouts alone are not enough).
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { cache } from "react";

export type ApiAuthOk = { ok: true; userId: string };
export type ApiAuthFail = { ok: false; response: NextResponse };
export type ApiAuthResult = ApiAuthOk | ApiAuthFail;

const checkSuspendedCached = cache(async (userId: string): Promise<boolean> => {
  const { isUserSuspended } = await import("@/lib/admin/users");
  return isUserSuspended(userId);
});

/**
 * Require a signed-in, non-suspended Clerk user.
 * Use this (or domain wrappers that call it) on every user API route.
 */
export async function requireApiUser(): Promise<ApiAuthResult> {
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

  return { ok: true, userId };
}
