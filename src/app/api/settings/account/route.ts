import { z } from "zod";
import { NextResponse } from "next/server";
import {
  publicAccountPreferences,
  getAccountPreferences,
  getIdleTimeoutPolicyForUser,
  IdleTimeoutPreferenceError,
  updateAccountPreferences,
} from "@/lib/account-preferences";
import { requireApiUser } from "@/lib/auth/api";
import { ensureAppUser } from "@/lib/users";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { APP_LOCALES } from "@/lib/i18n/locales";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const prefsPatchSchema = z
  .object({
    emailMovieReady: z.boolean().optional(),
    emailFamilyInvite: z.boolean().optional(),
    emailStorageWarnings: z.boolean().optional(),
    inAppMovieReady: z.boolean().optional(),
    inAppFamilyInvite: z.boolean().optional(),
    inAppStorageWarnings: z.boolean().optional(),
    inAppMediaReady: z.boolean().optional(),
    inAppEmergencyAccess: z.boolean().optional(),
    notificationSoundEnabled: z.boolean().optional(),
    celebrationSoundEnabled: z.boolean().optional(),
    askAiRobotGreetingsEnabled: z.boolean().optional(),
    emailMilestoneCelebrations: z.boolean().optional(),
    productUpdatesEmail: z.boolean().optional(),
    idleTimeoutEnabled: z.boolean().optional(),
    locale: z.enum(APP_LOCALES).optional(),
  })
  .strict();

/**
 * GET  — current account preferences + idle-timeout policy
 * PATCH — update notification / privacy toggles (idle disable is paid-only)
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    await ensureAppUser(authResult.userId);
    const [prefs, idleTimeout] = await Promise.all([
      getAccountPreferences(authResult.userId),
      getIdleTimeoutPolicyForUser(authResult.userId),
    ]);
    return NextResponse.json({
      ok: true,
      preferences: publicAccountPreferences(prefs),
      idleTimeout,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load account preferences");
  }
}

export async function PATCH(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = prefsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid preferences", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(
      ([, value]) => typeof value === "boolean" || typeof value === "string",
    ),
  );
  if (Object.keys(patch).length === 0) {
    return apiError("No preference changes provided", {
      status: 400,
      code: "validation",
    });
  }

  try {
    await ensureAppUser(authResult.userId);
    const prefs = await updateAccountPreferences(authResult.userId, patch);
    const idleTimeout = await getIdleTimeoutPolicyForUser(authResult.userId);
    return NextResponse.json({
      ok: true,
      preferences: publicAccountPreferences(prefs),
      idleTimeout,
    });
  } catch (error) {
    if (error instanceof IdleTimeoutPreferenceError) {
      return apiError(error.message, {
        status: 403,
        code: error.code,
      });
    }
    return apiErrorFromUnknown(error, "Failed to update account preferences");
  }
}
