import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  BETA_NDA_COOKIE,
  BETA_NDA_VERSION,
  isBetaNdaRequired,
  recordBetaNdaAcceptance,
  betaNdaCookieOptions,
  hasAcceptedBetaNda,
} from "@/lib/beta-nda";
import {
  TERMS_COOKIE,
  TERMS_VERSION,
  isTermsRequired,
  recordTermsAcceptance,
  termsCookieOptions,
  hasAcceptedTerms,
} from "@/lib/terms";
import { LEGAL_AGREE_PATH } from "@/lib/legal-agree/gate";
import { APP_HOME_PATH, FIRST_FAMILY_MOVIE_PATH } from "@/lib/routes";
import { ensureAppUser } from "@/lib/users";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  email: z.string().trim().email("Enter a valid email address").max(320),
  agreed: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must agree to continue.",
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
  const fallback = APP_HOME_PATH;
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (
    raw.startsWith(LEGAL_AGREE_PATH) ||
    raw.startsWith("/beta-agree") ||
    raw.startsWith("/terms-agree") ||
    raw.startsWith(FIRST_FAMILY_MOVIE_PATH) ||
    raw.startsWith("/sign-in") ||
    raw.startsWith("/sign-up")
  ) {
    return fallback;
  }
  return raw;
}

/**
 * POST /api/legal/accept — record Beta NDA and/or Terms in one clickwrap step.
 */
export async function POST(request: Request) {
  if (!isBetaNdaRequired() && !isTermsRequired()) {
    return NextResponse.json(
      { ok: true, skipped: true, redirectTo: APP_HOME_PATH },
      { status: 200 },
    );
  }

  const authResult = await requireApiUser({
    skipBetaNda: true,
    skipTerms: true,
  });
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `legal-accept:${authResult.userId}`,
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
        error: "Please complete all required fields.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(authResult.userId);
  } catch (error) {
    console.warn("[legal.accept] ensureAppUser failed", error);
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent");
  const fullName = parsed.data.fullName;
  const email = parsed.data.email;

  try {
    const needNda =
      isBetaNdaRequired() &&
      !(await hasAcceptedBetaNda(authResult.userId));
    const needTerms =
      isTermsRequired() && !(await hasAcceptedTerms(authResult.userId));

    if (needNda) {
      await recordBetaNdaAcceptance({
        userId: authResult.userId,
        fullName,
        email,
        ipAddress: ip,
        userAgent: ua,
        ndaVersion: BETA_NDA_VERSION,
      });
    }

    if (needTerms) {
      await recordTermsAcceptance({
        userId: authResult.userId,
        fullName,
        email,
        ipAddress: ip,
        userAgent: ua,
        termsVersion: TERMS_VERSION,
      });
    }

    const redirectTo = safeRedirectPath(parsed.data.redirectTo);

    const response = NextResponse.json({
      ok: true,
      ndaVersion: needNda || isBetaNdaRequired() ? BETA_NDA_VERSION : null,
      termsVersion: needTerms || isTermsRequired() ? TERMS_VERSION : null,
      redirectTo,
    });

    if (isBetaNdaRequired()) {
      response.cookies.set(
        BETA_NDA_COOKIE,
        BETA_NDA_VERSION,
        betaNdaCookieOptions(),
      );
    }
    if (isTermsRequired()) {
      response.cookies.set(TERMS_COOKIE, TERMS_VERSION, termsCookieOptions());
    }

    return response;
  } catch (error) {
    console.error("[legal.accept] failed", error);
    return NextResponse.json(
      { error: "Could not save your agreement. Please try again." },
      { status: 500 },
    );
  }
}

