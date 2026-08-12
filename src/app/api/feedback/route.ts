import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MODES,
  FEEDBACK_SEVERITIES,
} from "@/lib/feedback/categories";
import { notifyFeedbackSubmission } from "@/lib/feedback/notify";
import { FEEDBACK_SCREENSHOT_MAX_BYTES } from "@/lib/feedback/screenshot-limits";
import { createFeedbackSubmission, listRecentFeedbackForUser } from "@/lib/feedback/submit";
import { uploadFeedbackScreenshot } from "@/lib/feedback/upload-screenshot";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/feedback — recent submissions for the signed-in user (status history).
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const items = await listRecentFeedbackForUser(authResult.userId, 5);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not load feedback history");
  }
}

/** ~2.4MB base64 ≈ 1.8MB binary — keep under FEEDBACK_SCREENSHOT_MAX_BYTES. */
const MAX_SCREENSHOT_DATA_URL_CHARS =
  Math.ceil((FEEDBACK_SCREENSHOT_MAX_BYTES * 4) / 3) + 64;

const bodySchema = z
  .object({
    /** Preferred: type. `mode` kept for older clients. */
    type: z.enum(FEEDBACK_MODES).optional(),
    mode: z.enum(FEEDBACK_MODES).optional(),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(8).max(8000),
    expectedBehavior: z.string().trim().max(4000).optional().nullable(),
    severity: z.enum(FEEDBACK_SEVERITIES).optional().nullable(),
    problemStatement: z.string().trim().max(4000).optional().nullable(),
    suggestedSolution: z.string().trim().max(4000).optional().nullable(),
    category: z.enum(FEEDBACK_CATEGORIES),
    pathname: z.string().trim().min(1).max(500),
    pageUrl: z.string().trim().min(1).max(2000),
    browser: z.string().trim().max(80).optional().nullable(),
    os: z.string().trim().max(80).optional().nullable(),
    viewportWidth: z.number().int().min(0).max(100_000).optional().nullable(),
    viewportHeight: z.number().int().min(0).max(100_000).optional().nullable(),
    devicePixelRatio: z.number().min(0).max(16).optional().nullable(),
    consoleErrors: z.array(z.string().max(600)).max(20).optional(),
    userAgent: z.string().max(512).optional().nullable(),
    clientTimestamp: z.string().max(64).optional().nullable(),
    email: z.string().trim().email().max(320).optional().nullable(),
    screenshotDataUrl: z
      .string()
      .max(MAX_SCREENSHOT_DATA_URL_CHARS)
      .regex(/^data:image\/(jpeg|png|webp);base64,/i)
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const mode = data.type ?? data.mode;
    if (!mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message: "type (bug|feature) is required",
      });
      return;
    }
    if (mode === "bug" && !data.severity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["severity"],
        message: "Severity is required for bug reports",
      });
    }
    if (mode === "feature" && !data.problemStatement?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problemStatement"],
        message: "Problem statement is required for feature requests",
      });
    }
  });

/**
 * POST /api/feedback — store a FeedbackSubmission and notify the team.
 *
 * Returns `{ ok, ticketId, id, status, hasScreenshot }`.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `feedback:${authResult.userId}`,
    RATE_LIMITS.feedbackSubmit.limit,
    RATE_LIMITS.feedbackSubmit.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Please complete the required fields.", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  const mode = (parsed.data.type ?? parsed.data.mode)!;

  try {
    await ensureAppUser(authResult.userId);

    let screenshotKey: string | null = null;
    let screenshotContentType: string | null = null;
    if (parsed.data.screenshotDataUrl) {
      try {
        const uploaded = await uploadFeedbackScreenshot({
          userId: authResult.userId,
          dataUrl: parsed.data.screenshotDataUrl,
        });
        if (uploaded) {
          screenshotKey = uploaded.key;
          screenshotContentType = uploaded.contentType;
        }
      } catch (error) {
        console.warn("[api.feedback] screenshot upload failed", error);
        return apiError(
          "Could not save the screenshot. Remove it or try a smaller image.",
          { status: 400, code: "screenshot_upload_failed" },
        );
      }
    }

    const row = await createFeedbackSubmission({
      userId: authResult.userId,
      email: parsed.data.email,
      mode,
      title: parsed.data.title,
      description: parsed.data.description,
      expectedBehavior: parsed.data.expectedBehavior,
      severity: parsed.data.severity,
      problemStatement: parsed.data.problemStatement,
      suggestedSolution: parsed.data.suggestedSolution,
      category: parsed.data.category,
      pathname: parsed.data.pathname,
      pageUrl: parsed.data.pageUrl,
      browser: parsed.data.browser,
      os: parsed.data.os,
      viewportWidth: parsed.data.viewportWidth,
      viewportHeight: parsed.data.viewportHeight,
      devicePixelRatio: parsed.data.devicePixelRatio,
      consoleErrors: parsed.data.consoleErrors,
      userAgent: parsed.data.userAgent,
      clientTimestamp: parsed.data.clientTimestamp,
      screenshotKey,
      screenshotContentType,
    });

    // Notify team — never fail the user response if email/webhook misconfigured.
    void notifyFeedbackSubmission(row).catch((error) => {
      console.error("[api.feedback] notify failed", {
        ticketId: row.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return NextResponse.json({
      ok: true,
      ticketId: row.ticketId,
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      hasScreenshot: Boolean(screenshotKey),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not save your feedback");
  }
}
