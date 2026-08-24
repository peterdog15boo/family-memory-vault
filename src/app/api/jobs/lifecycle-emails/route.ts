import { NextResponse } from "next/server";
import { z } from "zod";
import { drainLifecycleTipEmails } from "@/lib/email/campaigns";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";

/**
 * POST /api/jobs/lifecycle-emails
 *
 * Evaluate feature-discovery tip eligibility and send at most one tip per user
 * (7-day cooldown). Auth: Bearer WORKER_SECRET / CRON_SECRET.
 *
 * Body (optional): { "limit": 40, "force": false }
 * `force` skips the 7-day cadence (still respects prefs + once-per-campaign).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    force: z.boolean().optional(),
  })
  .optional();

export async function POST(request: Request) {
  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(
    `worker:lifecycle-emails:${request.headers.get("x-forwarded-for") ?? "local"}`,
    RATE_LIMITS.workerDrain.limit,
    RATE_LIMITS.workerDrain.windowMs,
  );
  if (limited) return limited;

  let limit = 40;
  let force = false;
  try {
    const json = await request.json().catch(() => undefined);
    const parsed = bodySchema.safeParse(json);
    if (parsed.success && parsed.data) {
      if (parsed.data.limit) limit = parsed.data.limit;
      if (parsed.data.force) force = parsed.data.force;
    }
  } catch {
    // empty body is fine
  }

  console.info("[api.jobs.lifecycle-emails] Drain starting", { limit, force });

  try {
    const result = await drainLifecycleTipEmails({ limit, force });
    const sent = result.processed.filter((p) => p.sent).length;
    console.info("[api.jobs.lifecycle-emails] Drain finished", {
      considered: result.processed.length,
      sent,
    });
    return NextResponse.json({
      ok: true,
      considered: result.processed.length,
      sent,
      processed: result.processed,
    });
  } catch (error) {
    console.error("[api.jobs.lifecycle-emails] Drain failed", error);
    return NextResponse.json(
      { error: "Lifecycle email drain failed." },
      { status: 500 },
    );
  }
}
