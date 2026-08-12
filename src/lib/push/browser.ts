export const PUSH_SW_PATH = "/push-sw.js";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(PUSH_SW_PATH, { scope: "/" });
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await registerPushWorker();
  await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeBrowserPush(
  publicKey: string,
): Promise<PushSubscription> {
  const registration = await registerPushWorker();
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
}

export async function unsubscribeBrowserPush(): Promise<string | null> {
  const sub = await getExistingPushSubscription();
  const endpoint = sub?.endpoint ?? null;
  if (sub) await sub.unsubscribe();
  return endpoint;
}

export async function saveSubscriptionToServer(
  sub: PushSubscription,
): Promise<void> {
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) {
    throw new Error("subscribe_failed");
  }
}

export async function deleteSubscriptionOnServer(
  endpoint: string,
): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export async function fetchPushConfig(): Promise<{
  configured: boolean;
  publicKey: string | null;
}> {
  const res = await fetch("/api/push/config", { credentials: "same-origin" });
  if (!res.ok) return { configured: false, publicKey: null };
  const data = (await res.json()) as {
    configured?: boolean;
    publicKey?: string | null;
  };
  return {
    configured: Boolean(data.configured && data.publicKey),
    publicKey: data.publicKey ?? null,
  };
}

/** Refresh a granted subscription without prompting. */
export async function syncGrantedPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  const config = await fetchPushConfig();
  if (!config.configured || !config.publicKey) return;
  const sub = await subscribeBrowserPush(config.publicKey);
  await saveSubscriptionToServer(sub);
}
