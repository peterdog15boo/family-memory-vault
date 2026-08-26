import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import { logAdminAudit } from "@/lib/admin/audit";
import { getDb } from "@/lib/db";
import { familyTreeNodes, familyTreeRelationships } from "@/lib/db/schema";
import { runFamilyTreeRepairPass } from "@/lib/family-tree/repair-apply";
import { planFamilyTreeRepair } from "@/lib/family-tree/repair";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Vault owner whose tree should be repaired. */
  userId: z.string().trim().min(1),
  dryRun: z.boolean().optional(),
});

/**
 * POST /api/admin/family-tree/repair
 * Admin-triggerable Genealogy repair pass for one vault owner's tree.
 */
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const dryRun = parsed.data.dryRun === true;
  const targetUserId = parsed.data.userId;
  const db = getDb();

  try {
    const [rawNodes, rawRelationships] = await Promise.all([
      db
        .select()
        .from(familyTreeNodes)
        .where(eq(familyTreeNodes.userId, targetUserId))
        .orderBy(asc(familyTreeNodes.createdAt)),
      db
        .select()
        .from(familyTreeRelationships)
        .where(eq(familyTreeRelationships.userId, targetUserId))
        .orderBy(asc(familyTreeRelationships.createdAt)),
    ]);

    if (dryRun) {
      const plan = planFamilyTreeRepair({
        nodes: rawNodes.map((n) => ({
          id: n.id,
          label: n.label,
          personId: n.personId,
          notes: n.notes,
        })),
        relationships: rawRelationships.map((r) => ({
          id: r.id,
          fromNodeId: r.fromNodeId,
          toNodeId: r.toNodeId,
          type: r.type,
        })),
      });
      await logAdminAudit({
        actorId: authResult.userId,
        action: "family_tree.repair_dry_run",
        targetType: "user",
        targetId: targetUserId,
        metadata: {
          opCount: plan.ops.length,
          before: plan.beforeSnapshot,
          ops: plan.ops,
        },
      });
      return NextResponse.json({
        ok: true,
        dryRun: true,
        summary: plan.summary,
        opCount: plan.ops.length,
        ops: plan.ops,
        before: plan.beforeSnapshot,
      });
    }

    const repaired = await runFamilyTreeRepairPass(
      targetUserId,
      rawNodes,
      rawRelationships,
    );

    await logAdminAudit({
      actorId: authResult.userId,
      action: "family_tree.repair",
      targetType: "user",
      targetId: targetUserId,
      metadata: {
        applied: repaired.result.applied,
        opsApplied: repaired.result.opsApplied,
        flaggedNodeIds: repaired.result.flaggedNodeIds,
        before: repaired.result.before,
        after: repaired.result.after,
        message: repaired.result.message,
      },
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      ...repaired.result,
    });
  } catch (error) {
    console.error("[api.admin.family-tree.repair] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Family tree repair failed",
      },
      { status: 500 },
    );
  }
}
