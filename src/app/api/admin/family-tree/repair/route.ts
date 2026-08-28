import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import { logAdminAudit } from "@/lib/admin/audit";
import { getDb } from "@/lib/db";
import {
  families,
  familyTreeNodes,
  familyTreeRelationships,
} from "@/lib/db/schema";
import { runFamilyTreeRepairPass } from "@/lib/family-tree/repair-apply";
import { planFamilyTreeRepair } from "@/lib/family-tree/repair";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    /** Family whose tree should be repaired. */
    familyId: z.string().trim().min(1).optional(),
    /** People vault / plan owner (family creator). Alias: userId. */
    peopleOwnerId: z.string().trim().min(1).optional(),
    /** @deprecated Prefer peopleOwnerId — kept for admin UI compatibility. */
    userId: z.string().trim().min(1).optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.familyId || v.peopleOwnerId || v.userId), {
    message: "familyId or peopleOwnerId/userId is required",
  });

/**
 * POST /api/admin/family-tree/repair
 * Admin-triggerable Genealogy repair pass for one family tree.
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
  const db = getDb();

  try {
    let familyId = parsed.data.familyId?.trim() || "";
    let peopleOwnerId =
      parsed.data.peopleOwnerId?.trim() ||
      parsed.data.userId?.trim() ||
      "";

    if (familyId && !peopleOwnerId) {
      const [fam] = await db
        .select({ createdByUserId: families.createdByUserId })
        .from(families)
        .where(eq(families.id, familyId))
        .limit(1);
      if (!fam) {
        return NextResponse.json({ error: "Family not found" }, { status: 404 });
      }
      peopleOwnerId = fam.createdByUserId;
    }

    if (!familyId && peopleOwnerId) {
      const [fam] = await db
        .select({ id: families.id })
        .from(families)
        .where(eq(families.createdByUserId, peopleOwnerId))
        .limit(1);
      if (!fam) {
        return NextResponse.json(
          { error: "No family found for that people owner" },
          { status: 404 },
        );
      }
      familyId = fam.id;
    }

    const scope = { familyId, peopleOwnerId };

    const [rawNodes, rawRelationships] = await Promise.all([
      db
        .select()
        .from(familyTreeNodes)
        .where(eq(familyTreeNodes.familyId, familyId))
        .orderBy(asc(familyTreeNodes.createdAt)),
      db
        .select()
        .from(familyTreeRelationships)
        .where(eq(familyTreeRelationships.familyId, familyId))
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
        targetType: "family",
        targetId: familyId,
        metadata: {
          peopleOwnerId,
          opCount: plan.ops.length,
          before: plan.beforeSnapshot,
          ops: plan.ops,
        },
      });
      return NextResponse.json({
        ok: true,
        dryRun: true,
        familyId,
        peopleOwnerId,
        summary: plan.summary,
        opCount: plan.ops.length,
        ops: plan.ops,
        before: plan.beforeSnapshot,
      });
    }

    const repaired = await runFamilyTreeRepairPass(
      scope,
      rawNodes,
      rawRelationships,
    );

    await logAdminAudit({
      actorId: authResult.userId,
      action: "family_tree.repair",
      targetType: "family",
      targetId: familyId,
      metadata: {
        peopleOwnerId,
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
      familyId,
      peopleOwnerId,
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
