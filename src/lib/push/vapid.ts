/**
 * VAPID config for Web Push. Public key is served only to signed-in clients.
 * Generate: npx web-push generate-vapid-keys
 */

export type WebPushVapid = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function extractEmailFromFromHeader(from?: string | null): string | null {
  const raw = from?.trim();
  if (!raw) return null;
  const angled = raw.match(/<([^>]+)>/);
  const candidate = (angled?.[1] ?? raw).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate;
}

export function resolveVapidSubject(input?: {
  explicit?: string | null;
  emailFrom?: string | null;
  appUrl?: string | null;
}): string {
  const explicit = input?.explicit?.trim();
  if (explicit && /^(mailto:|https:\/\/)/i.test(explicit)) {
    return explicit.replace(/\/+$/, "");
  }

  const email = extractEmailFromFromHeader(input?.emailFrom);
  if (email) return `mailto:${email}`;

  const app = input?.appUrl?.trim().replace(/\/+$/, "");
  if (app?.toLowerCase().startsWith("https://")) return app;

  return "mailto:hello@localhost";
}

export function getWebPushVapid(): WebPushVapid | null {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: resolveVapidSubject({
      explicit: process.env.WEB_PUSH_VAPID_SUBJECT,
      emailFrom: process.env.EMAIL_FROM,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL,
    }),
  };
}

export function isWebPushConfigured(): boolean {
  return getWebPushVapid() !== null;
}
