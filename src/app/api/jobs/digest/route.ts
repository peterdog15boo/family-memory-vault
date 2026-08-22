import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";
import { drainWeeklyDigests } from "@/lib/digest/weekly";

/**
 * POST /api/jobs/digest
 *
 * Send weekly vault digests (email + in-app) for eligible users.
 * Auth: Bearer WORKER_SECRET / CRON_SECRET.
 *
 * Body (optional): { "limit": 40, "force": false }
 * `force` skips the Sunday-only gate (still respects 6-day dedupe unless
 * lastWeeklyDigestAt is cleared).
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
    `worker:digest:${request.headers.get("x-forwarded-for") ?? "local"}`,
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

  console.info("[api.jobs.digest] Drain starting", { limit, force });

  try {
    const result = await drainWeeklyDigests({ limit, force });
    const sent = result.processed.filter((p) => p.sent).length;
    console.info("[api.jobs.digest] Drain finished", {
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
    console.error("[api.jobs.digest] Drain failed", error);
    return NextResponse.json(
      { error: "Digest drain failed." },
      { status: 500 },
    );
  }
}
