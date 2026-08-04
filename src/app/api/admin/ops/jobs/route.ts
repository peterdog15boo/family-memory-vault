import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  getAdminOpsOverview,
  getFailedJobDetail,
  retryProcessingJob,
} from "@/lib/admin/ops";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("retry"),
    jobId: z.string().min(1),
    resetAttempts: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("inspect"),
    jobId: z.string().min(1),
  }),
]);

/**
 * GET  — ops overview JSON
 * POST — retry / inspect failed jobs
 */
export async function GET() {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  try {
    const overview = await getAdminOpsOverview(authResult.userId);
    return NextResponse.json({
      ok: true,
      generatedAt: overview.generatedAt.toISOString(),
      jobsByStatus: overview.jobsByStatus,
      pipelines: overview.pipelines,
      movies: overview.movies,
      storage: overview.storage,
    });
  } catch (error) {
    console.error("[api.admin.ops] overview failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load ops overview",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "inspect") {
      const job = await getFailedJobDetail(
        authResult.userId,
        parsed.data.jobId,
      );
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        job: {
          ...job,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
          processedAt: job.processedAt?.toISOString() ?? null,
        },
      });
    }

    const job = await retryProcessingJob(
      authResult.userId,
      parsed.data.jobId,
      {
        resetAttempts: parsed.data.resetAttempts,
      },
    );
    return NextResponse.json({
      ok: true,
      job: {
        ...job,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        processedAt: job.processedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[api.admin.ops] action failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 400 },
    );
  }
}
