/**
 * Admin product announcement emails (opt-in productUpdatesEmail only).
 */

import { and, desc, isNull, ne, sql } from "drizzle-orm";
import { userAllowsEmail } from "@/lib/account-preferences";
import { logAdminAudit } from "@/lib/admin/audit";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendProductAnnouncementEmail } from "@/lib/email";
import { emailAppUrl } from "@/lib/email/templates";
import { getUserContact } from "@/lib/email/lifecycle";
import { getAppUrl } from "@/lib/env";

export type AnnouncementInput = {
  featureName: string;
  featureSummary: string;
  /** App-relative path (/movies) or absolute URL on the app host. */
  featureCtaUrl: string;
};

export type AnnouncementSendResult = {
  considered: number;
  sent: number;
  failed: number;
  skippedPrefs: number;
  skippedNoEmail: number;
  dryRun: boolean;
  errors: Array<{ userId: string; error: string }>;
};

/**
 * Normalize CTA to an absolute app URL. Rejects off-site destinations.
 */
export function resolveAnnouncementCtaUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) return null;
    return emailAppUrl(trimmed);
  }

  try {
    const url = new URL(trimmed);
    const app = new URL(getAppUrl());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.host !== app.host) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Count / send announcement to opted-in users.
 */
export async function sendProductAnnouncement(input: {
  announcement: AnnouncementInput;
  actorId: string;
  dryRun?: boolean;
  limit?: number;
}): Promise<AnnouncementSendResult> {
  const featureName = input.announcement.featureName.trim();
  const featureSummary = input.announcement.featureSummary.trim();
  const featureCtaUrl = resolveAnnouncementCtaUrl(
    input.announcement.featureCtaUrl,
  );

  if (!featureName || !featureSummary || !featureCtaUrl) {
    throw new Error("Invalid announcement fields");
  }

  const limit = Math.min(Math.max(input.limit ?? 500, 1), 2000);
  const dryRun = Boolean(input.dryRun);
  const db = getDb();

  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      accountPreferences: users.accountPreferences,
    })
    .from(users)
    .where(
      and(
        isNull(users.suspendedAt),
        ne(users.email, ""),
        sql`coalesce((${users.accountPreferences}->>'productUpdatesEmail')::boolean, false) = true`,
      ),
    )
    .orderBy(desc(users.updatedAt))
    .limit(limit);

  const result: AnnouncementSendResult = {
    considered: candidates.length,
    sent: 0,
    failed: 0,
    skippedPrefs: 0,
    skippedNoEmail: 0,
    dryRun,
    errors: [],
  };

  if (dryRun) {
    result.sent = candidates.length;
    return result;
  }

  for (const row of candidates) {
    if (!(await userAllowsEmail(row.id, "product_updates"))) {
      result.skippedPrefs += 1;
      continue;
    }

    const contact = await getUserContact(row.id);
    if (!contact?.email) {
      result.skippedNoEmail += 1;
      continue;
    }

    const send = await sendProductAnnouncementEmail({
      to: contact.email,
      firstName: contact.firstName,
      featureName,
      featureSummary,
      featureCtaUrl,
    });

    if (send.ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
      result.errors.push({
        userId: row.id,
        error: send.error ?? "send_failed",
      });
    }
  }

  await logAdminAudit({
    actorId: input.actorId,
    action: "email.announcement_send",
    targetType: "announcement",
    targetId: featureName.slice(0, 64),
    metadata: {
      featureName,
      featureSummary: featureSummary.slice(0, 500),
      featureCtaUrl,
      considered: result.considered,
      sent: result.sent,
      failed: result.failed,
      skippedPrefs: result.skippedPrefs,
      skippedNoEmail: result.skippedNoEmail,
    },
  });

  return result;
}
