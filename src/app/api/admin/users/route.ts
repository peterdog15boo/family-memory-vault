import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi, setUserAdminFlag } from "@/lib/auth/admin";
import {
  adminSetUserPlan,
  listAdminUsers,
  setUserSuspended,
} from "@/lib/admin/users";
import { PLAN_SLUGS } from "@/lib/db/schema";

export const runtime = "nodejs";

const listSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["all", "active", "suspended", "admin"]).optional(),
  plan: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setAdmin"),
    userId: z.string().min(1),
    isAdmin: z.boolean(),
  }),
  z.object({
    action: z.literal("setSuspended"),
    userId: z.string().min(1),
    suspended: z.boolean(),
    reason: z.string().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal("setPlan"),
    userId: z.string().min(1),
    planSlug: z.enum(PLAN_SLUGS),
  }),
]);

/**
 * GET  — list users (search + filters)
 * POST — setAdmin | setSuspended | setPlan
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
  const parsed = listSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    plan: url.searchParams.get("plan") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await listAdminUsers(authResult.userId, parsed.data);
    return NextResponse.json({
      ok: true,
      total: result.total,
      users: result.users.map((u) => ({
        ...u,
        suspendedAt: u.suspendedAt?.toISOString() ?? null,
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[api.admin.users] list failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list users" },
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
  const userId = authResult.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Back-compat: { userId, isAdmin } without action
  if (
    body &&
    typeof body === "object" &&
    !("action" in body) &&
    "userId" in body &&
    "isAdmin" in body
  ) {
    body = { action: "setAdmin", ...(body as object) };
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;
    if (data.action === "setAdmin") {
      if (data.userId === userId && !data.isAdmin) {
        return NextResponse.json(
          { error: "You cannot remove your own admin flag from this UI." },
          { status: 400 },
        );
      }
      const updated = await setUserAdminFlag(
        userId,
        data.userId,
        data.isAdmin,
      );
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, user: updated });
    }

    if (data.action === "setSuspended") {
      await setUserSuspended(
        userId,
        data.userId,
        data.suspended,
        data.reason,
      );
      return NextResponse.json({ ok: true });
    }

    const plan = await adminSetUserPlan(userId, data.userId, data.planSlug);
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("[api.admin.users] action failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 400 },
    );
  }
}
