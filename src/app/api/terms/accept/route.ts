import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  TERMS_COOKIE,
  TERMS_VERSION,
  isTermsRequired,
  recordTermsAcceptance,
  termsCookieOptions,
} from "@/lib/terms";
import { getPostAuthLandingPath } from "@/lib/routes";
import { ensureAppUser } from "@/lib/users";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agreed: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must agree to the Terms of Service to continue.",
    }),
  redirectTo: z.string().trim().max(500).optional(),
});

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp ? realIp.slice(0, 128) : null;
}

function safeRedirectPath(raw: string | undefined): string {
  const fallback = getPostAuthLandingPath();
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.startsWith("/terms-agree")) return fallback;
  if (raw.startsWith("/beta-agree")) return fallback;
  if (raw.startsWith("/sign-in") || raw.startsWith("/sign-up")) {
    return fallback;
  }
  return raw;
}

/**
 * POST /api/terms/accept — record Terms of Service clickwrap acceptance.
 * Requires Beta NDA first when BETA_NDA_REQUIRED=true (does not skip NDA).
 */
export async function POST(request: Request) {
  if (!isTermsRequired()) {
    return NextResponse.json(
      { ok: true, skipped: true, redirectTo: getPostAuthLandingPath() },
      { status: 200 },
    );
  }

  const authResult = await requireApiUser({ skipTerms: true });
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `terms-accept:${authResult.userId}`,
    RATE_LIMITS.termsAccept.limit,
    RATE_LIMITS.termsAccept.windowMs,
  );
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please agree to the Terms of Service to continue.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(authResult.userId);
  } catch (error) {
    console.warn("[terms.accept] ensureAppUser failed", error);
  }

  let fullName = "Family member";
  let email = "";
  try {
    const user = await currentUser();
    fullName =
      user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.username ||
      "Family member";
    email =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      "";
  } catch (error) {
    console.warn("[terms.accept] currentUser failed", error);
  }

  if (!email) {
    return NextResponse.json(
      {
        error:
          "Your account is missing an email address. Update it in account settings, then try again.",
      },
      { status: 400 },
    );
  }

  try {
    const row = await recordTermsAcceptance({
      userId: authResult.userId,
      fullName,
      email,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      termsVersion: TERMS_VERSION,
    });

    const redirectTo = safeRedirectPath(parsed.data.redirectTo);
    const response = NextResponse.json({
      ok: true,
      acceptedAt: row?.acceptedAt?.toISOString() ?? new Date().toISOString(),
      termsVersion: TERMS_VERSION,
      redirectTo,
    });

    response.cookies.set(
      TERMS_COOKIE,
      TERMS_VERSION,
      termsCookieOptions(),
    );

    return response;
  } catch (error) {
    console.error("[terms.accept] failed", error);
    return NextResponse.json(
      { error: "Could not save your agreement. Please try again." },
      { status: 500 },
    );
  }
}
