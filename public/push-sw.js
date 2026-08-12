/* Family Memory Vault — Web Push service worker (scope: /) */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Family Memory Vault",
    body: "",
    href: "/dashboard",
    tag: "fmv",
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* ignore malformed payloads */
    }
  }

  const href =
    typeof data.href === "string" && data.href.startsWith("/")
      ? data.href
      : "/dashboard";

  event.waitUntil(
    self.registration.showNotification(data.title || "Family Memory Vault", {
      body: data.body || "",
      data: { href },
      tag: data.tag || "fmv",
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href =
    (event.notification.data && event.notification.data.href) || "/dashboard";
  const url = new URL(href, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* older browsers */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
