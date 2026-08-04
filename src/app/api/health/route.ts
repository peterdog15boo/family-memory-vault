/**
 * Lightweight DB / app health probe for load balancers and uptime monitors.
 */

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LogEvents } from "@/lib/observability/events";
import { errorFields, logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

/**
 * GET /api/health
 *
 * Public — no auth. Returns 200 when the database responds; 503 otherwise.
 * Does not expose secrets or internal connection strings.
 */
export async function GET() {
  const started = Date.now();
  const checks: { database: CheckStatus } = { database: "error" };

  try {
    const db = getDb();
    await db.execute(sql`select 1 as ok`);
    checks.database = "ok";

    const body = {
      status: "ok" as const,
      checks,
      durationMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
    logger.debug(LogEvents.healthCheck, body);
    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const body = {
      status: "degraded" as const,
      checks,
      durationMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
    logger.error(LogEvents.healthCheck, {
      ...body,
      ...errorFields(error),
    });
    return NextResponse.json(body, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
