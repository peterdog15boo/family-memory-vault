import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acknowledgeAvaStep,
  disableAva,
  dismissAva,
  getAvaProgress,
  listAvaAvatarCandidates,
  resumeAva,
  setAvaAvatar,
  setAvaScreenName,
  setAvaStep,
  skipAvaStep,
  skipEncourageMemory,
  type AvaStepId,
} from "@/lib/ava";
import { requireApiUser } from "@/lib/auth/api";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const stepIdSchema = z.enum([
  "welcome",
  "screen_name",
  "avatar",
  "upload",
  "moderation",
  "photos_ready",
  "encourage_memory",
  "create_memory",
  "people",
  "create_movie",
  "ask_ai",
  "invite",
  "documents_legacy",
  "will_planner",
  "complete",
]);

/** Optional tips. Legacy+ gates are dismissed in the client via sessionStorage. */
const skippableStepSchema = z.enum([
  "encourage_memory",
  "create_memory",
  "people",
  "create_movie",
  "ask_ai",
  "invite",
  "documents_legacy",
  "will_planner",
]);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("skip_encourage_memory") }),
  z.object({
    action: z.literal("skip_step"),
    stepId: skippableStepSchema,
  }),
  z.object({
    action: z.literal("set_step"),
    stepId: stepIdSchema,
  }),
  z.object({
    action: z.literal("acknowledge"),
    stepId: stepIdSchema,
  }),
  z.object({
    action: z.literal("set_screen_name"),
    screenName: z.string().trim().min(1).max(40),
  }),
  z.object({
    action: z.literal("set_avatar"),
    avatarMediaId: z.string().min(1).optional(),
    // Preset path, https URL, or small data:image URL (validated in setAvaAvatar).
    avatarUrl: z.string().min(1).max(200_000).optional(),
    skip: z.boolean().optional(),
  }),
]);

/**
 * GET /api/ava — Ava helper progress snapshot (+ optional avatar candidates).
 */
export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const { searchParams } = new URL(request.url);
  const includeCandidates = searchParams.get("avatars") === "1";

  const progress = await getAvaProgress(authResult.userId);
  const avatarCandidates = includeCandidates
    ? await listAvaAvatarCandidates(authResult.userId)
    : undefined;

  return NextResponse.json({ progress, avatarCandidates });
}

/**
 * POST /api/ava — dismiss / resume / profile / acknowledge steps.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    switch (parsed.data.action) {
      case "dismiss":
        await dismissAva(userId);
        break;
      case "resume":
        await resumeAva(userId);
        break;
      case "disable":
        await disableAva(userId);
        break;
      case "skip_encourage_memory":
        await skipEncourageMemory(userId);
        break;
      case "skip_step":
        await skipAvaStep(userId, parsed.data.stepId as AvaStepId);
        break;
      case "set_step":
        await setAvaStep(userId, parsed.data.stepId as AvaStepId);
        break;
      case "acknowledge":
        await acknowledgeAvaStep(userId, parsed.data.stepId as AvaStepId);
        break;
      case "set_screen_name":
        await setAvaScreenName(userId, parsed.data.screenName);
        break;
      case "set_avatar":
        await setAvaAvatar(userId, {
          avatarMediaId: parsed.data.avatarMediaId,
          avatarUrl: parsed.data.avatarUrl,
          skip: parsed.data.skip,
        });
        break;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update Ava.",
      },
      { status: 400 },
    );
  }

  const progress = await getAvaProgress(userId);
  return NextResponse.json({ ok: true, progress });
}
