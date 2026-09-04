import { NextResponse } from "next/server";
import { z } from "zod";
import { drainRetentionEmails } from "@/lib/retention/email";
import { isRetentionEmailEnabled } from "@/lib/retention/flags";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";

/**
 * POST /api/jobs/retention-emails
 *
 * Soft weekly retention ideas (one per user per 7 days). Auth: WORKER_SECRET.
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

  if (!isRetentionEmailEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: "retention_email_disabled",
      considered: 0,
      sent: 0,
      processed: [],
    });
  }

  const limited = enforceRateLimit(
    `worker:retention-emails:${request.headers.get("x-forwarded-for") ?? "local"}`,
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
    /* empty body ok */
  }

  console.info("[api.jobs.retention-emails] Drain starting", { limit, force });

  try {
    const result = await drainRetentionEmails({ limit, force });
    const sent = result.processed.filter((p) => p.sent).length;
    console.info("[api.jobs.retention-emails] Drain finished", {
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
    console.error("[api.jobs.retention-emails] Drain failed", error);
    return NextResponse.json(
      { error: "Retention email drain failed." },
      { status: 500 },
    );
  }
}
