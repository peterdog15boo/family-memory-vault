import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getUserNotifications, getUnreadCount } from "@/lib/notifications";

/**
 * GET /api/notifications?unread=1&limit=30
 */
export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? 30) || 30),
    100,
  );

  const [items, unreadCount] = await Promise.all([
    getUserNotifications(userId, { limit, unreadOnly }),
    getUnreadCount(userId),
  ]);

  return NextResponse.json({ items, unreadCount });
}
