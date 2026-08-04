import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getUserNotifications, getUnreadCount } from "@/lib/notifications";

export default async function NotificationsPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const [rows, unreadCount] = await Promise.all([
    getUserNotifications(userId, { limit: 100 }),
    getUnreadCount(userId),
  ]);

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <AppPageIntro
        slot="notifications"
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "You're all caught up."
        }
      />

      <div className="app-page mx-auto max-w-2xl">
        <NotificationsList initialItems={items} />
      </div>
    </>
  );
}
