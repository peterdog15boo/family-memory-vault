import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getUserNotifications, getUnreadCount } from "@/lib/notifications";
import { getTranslations } from "@/lib/i18n/server";

export default async function NotificationsPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const [rows, unreadCount, t] = await Promise.all([
    getUserNotifications(userId, { limit: 100 }),
    getUnreadCount(userId),
    getTranslations(),
  ]);

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    metadata: n.metadata ?? null,
  }));

  return (
    <>
      <AppPageIntro
        slot="notifications"
        title={t("notifications.ui.title")}
        description={
          unreadCount > 0
            ? unreadCount === 1
              ? t("notifications.ui.unreadDescription", { count: unreadCount })
              : t("notifications.ui.unreadDescriptionPlural", {
                  count: unreadCount,
                })
            : t("notifications.ui.caughtUp")
        }
      />

      <div className="app-page mx-auto max-w-2xl">
        <NotificationsList initialItems={items} />
      </div>
    </>
  );
}
