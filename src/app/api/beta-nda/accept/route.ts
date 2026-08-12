import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  BETA_NDA_COOKIE,
  BETA_NDA_VERSION,
  betaNdaCookieOptions,
  isBetaNdaRequired,
  recordBetaNdaAcceptance,
} from "@/lib/beta-nda";
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
      message: "You must agree to the NDA to continue.",
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
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/beta-agree")) return "/dashboard";
  // Allow /terms-agree so post-NDA flow can continue to Terms acceptance.
  if (raw.startsWith("/sign-in") || raw.startsWith("/sign-up")) {
    return "/dashboard";
  }
  return raw;
}

/**
 * POST /api/beta-nda/accept — record Beta Tester NDA clickwrap acceptance.
 */
export async function POST(request: Request) {
  if (!isBetaNdaRequired()) {
    return NextResponse.json(
      { ok: true, skipped: true, redirectTo: "/dashboard" },
      { status: 200 },
    );
  }

  const authResult = await requireApiUser({
    skipBetaNda: true,
    skipTerms: true,
  });
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `beta-nda:${authResult.userId}`,
    RATE_LIMITS.betaNdaAccept.limit,
    RATE_LIMITS.betaNdaAccept.windowMs,
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
    console.warn("[beta-nda.accept] ensureAppUser failed", error);
  }

  try {
    const row = await recordBetaNdaAcceptance({
      userId: authResult.userId,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      ndaVersion: BETA_NDA_VERSION,
    });

    const redirectTo = safeRedirectPath(parsed.data.redirectTo);
    const response = NextResponse.json({
      ok: true,
      acceptedAt: row?.acceptedAt?.toISOString() ?? new Date().toISOString(),
      ndaVersion: BETA_NDA_VERSION,
      redirectTo,
    });

    response.cookies.set(
      BETA_NDA_COOKIE,
      BETA_NDA_VERSION,
      betaNdaCookieOptions(),
    );

    return response;
  } catch (error) {
    console.error("[beta-nda.accept] failed", error);
    return NextResponse.json(
      { error: "Could not save your agreement. Please try again." },
      { status: 500 },
    );
  }
}
