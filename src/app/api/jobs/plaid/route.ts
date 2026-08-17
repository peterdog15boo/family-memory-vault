import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";
import { drainPlaidSyncJobs } from "@/workers/plaid";

/**
 * POST /api/jobs/plaid — drain pending plaid.sync jobs.
 * Auth: Bearer WORKER_SECRET / CRON_SECRET.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
  })
  .optional();

export async function POST(request: Request) {
  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(
    `worker:plaid:${request.headers.get("x-forwarded-for") ?? "local"}`,
    RATE_LIMITS.workerDrain.limit,
    RATE_LIMITS.workerDrain.windowMs,
  );
  if (limited) return limited;

  let limit = Number(process.env.QUEUE_BATCH_SIZE ?? 5);
  try {
    const json = await request.json().catch(() => undefined);
    const parsed = bodySchema.safeParse(json);
    if (parsed.success && parsed.data?.limit) {
      limit = parsed.data.limit;
    }
  } catch {
    // empty body ok
  }

  try {
    const result = await drainPlaidSyncJobs(limit);
    return NextResponse.json({
      ok: true,
      processed: result.processed.length,
      failures: result.failures.length,
      reclaimed: result.reclaimed,
      details: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Plaid drain failed",
      },
      { status: 500 },
    );
  }
}
