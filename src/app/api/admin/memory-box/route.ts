import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  listMemoryBoxOrders,
  memoryBoxOrderStatusSchema,
  updateMemoryBoxOrderStatus,
} from "@/lib/memory-box/orders";

export const runtime = "nodejs";

const patchSchema = z.object({
  orderId: z.string().trim().min(1),
  status: memoryBoxOrderStatusSchema,
});

/**
 * GET /api/admin/memory-box — list digitizing intake orders.
 */
export async function GET(request: Request) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "all";
  const statusParsed =
    statusParam === "all"
      ? { success: true as const, data: "all" as const }
      : memoryBoxOrderStatusSchema.safeParse(statusParam);

  if (!statusParsed.success) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  try {
    const orders = await listMemoryBoxOrders({
      status: statusParsed.data,
      limit: 100,
    });
    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    console.error("[api.admin.memory-box] list failed", error);
    return NextResponse.json(
      { error: "Failed to load Memory Box orders" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/memory-box — update order status.
 */
export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const order = await updateMemoryBoxOrderStatus({
      orderId: parsed.data.orderId,
      status: parsed.data.status,
    });

    await logAdminAudit({
      actorId: authResult.userId,
      action: "memory_box.status_change",
      targetType: "memory_box_order",
      targetId: order.id,
      metadata: { status: order.status },
    });

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update order";
    const status = message.includes("not found") ? 404 : 500;
    if (status === 500) {
      console.error("[api.admin.memory-box] update failed", error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
