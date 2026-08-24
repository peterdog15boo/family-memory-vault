import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "@/lib/notifications";

const bodySchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ id: z.string().trim().min(1).max(128) }),
]);

/** App shell embeds unread count — invalidate after read-state changes. */
function revalidateAppShell() {
  revalidatePath("/", "layout");
}

/**
 * POST /api/notifications/read
 * Body: { id: "..." } to mark one, or { all: true } to mark all.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide { id } or { all: true }", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if ("all" in parsed.data && parsed.data.all) {
    const count = await markAllAsRead(userId);
    revalidateAppShell();
    return NextResponse.json({ marked: count, unreadCount: 0 });
  }

  if ("id" in parsed.data) {
    const row = await markAsRead(parsed.data.id, userId);
    if (!row) {
      // Idempotent: already-read is success for clients that race mark + navigate.
      const unreadCount = await getUnreadCount(userId);
      revalidateAppShell();
      return NextResponse.json({ marked: 0, unreadCount });
    }
    const unreadCount = await getUnreadCount(userId);
    revalidateAppShell();
    return NextResponse.json({ marked: 1, unreadCount });
  }

  return NextResponse.json(
    { error: "Provide { id } or { all: true }" },
    { status: 400 },
  );
}
