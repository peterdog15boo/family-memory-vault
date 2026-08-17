/**
 * Sensitive access controls — step-up auth, audit logging, and shared constants.
 *
 * Applies to Private Documents and Digital Legacy secure items.
 * Family sharing permissions never grant access to these surfaces.
 */

import { auth, reverificationErrorResponse } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireApiUser, type ApiAuthResult } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { sensitiveAccessEvents } from "@/lib/db/schema";
import { logger } from "@/lib/observability/logger";

/** Default signed download URL lifetime for private document files. */
export const PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS = 60;

/** Hard cap for private document download URLs. */
export const PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS = 120;

/**
 * Legacy video playback uses the same short-lived download policy as private
 * documents (60s default / 120s max).
 */
export const LEGACY_VIDEO_PLAYBACK_TTL_SECONDS =
  PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS;
export const LEGACY_VIDEO_PLAYBACK_MAX_TTL_SECONDS =
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS;

export const SENSITIVE_ACCESS_ACTIONS = [
  "private_document.download_url",
  "private_document.thumbnail_url",
  "private_document.view_content",
  "legacy.secure_item.reveal",
  "legacy.granted.secure_item.reveal",
  "legacy.video.playback_url",
  "legacy.video.thumbnail_url",
  "legacy.granted.video.playback_url",
  "legacy.granted.video.thumbnail_url",
  "emergency_access.vault_view",
  "connected_account.link_token_create",
  "connected_account.connect",
  "connected_account.sync",
  "connected_account.disconnect",
  "connected_account.notes_update",
  "connected_account.category_update",
] as const;

export type SensitiveAccessAction = (typeof SENSITIVE_ACCESS_ACTIONS)[number];

export type SensitiveAccessTargetType =
  | "private_document"
  | "legacy_secure_item"
  | "legacy_video"
  | "legacy_vault"
  | "emergency_access_designation"
  | "plaid_item"
  | "linked_account";

export type LogSensitiveAccessInput = {
  userId: string;
  action: SensitiveAccessAction;
  targetType: SensitiveAccessTargetType;
  targetId: string;
  metadata?: Record<string, unknown> | null;
};

export const PRIVATE_VAULT_SECURITY_RULES = [
  "Private Documents and Digital Legacy are owner-only by default.",
  "Family membership and shared memories never grant access to private documents or legacy vaults.",
  "File access uses short-lived signed URLs only (60s default, 120s max for downloads / legacy video playback).",
  "Legacy videos live under private-legacy-videos/ and never appear in galleries, Memories, People, or family shared views.",
  "Secure item passwords and content are redacted in list/API responses until an explicit reveal step.",
  "Reveal and document download require recent session verification or explicit in-app confirmation.",
  "Sensitive views and downloads are appended to sensitive_access_events (no content in metadata).",
  "Thumbnails are image derivatives only — never document text, legacy content, or passwords.",
  "Notifications and emails must not include document bodies, legacy text, or secure item content.",
  "Assistant search indexes clean media only — never private_documents, legacy_*, or plaid/linked account tables.",
  "Connected Accounts (Plaid) are owner-only; access tokens stay encrypted server-side and never enter Ask AI or galleries.",
] as const;

export type SensitiveStepUpInput = {
  /** When true, allow body.confirmed === true as fallback if Clerk reverification is unavailable. */
  allowExplicitConfirm?: boolean;
  confirmed?: boolean;
};

export type SensitiveStepUpResult =
  | { ok: true; userId: string; method: "reverification" | "explicit_confirm" }
  | { ok: false; response: NextResponse };

/**
 * Require a fresh session factor (Clerk reverification) or explicit confirmation
 * before returning sensitive content or download URLs.
 */
export async function requireSensitiveStepUp(
  input: SensitiveStepUpInput = {},
): Promise<SensitiveStepUpResult> {
  const authResult: ApiAuthResult = await requireApiUser();
  if (!authResult.ok) {
    return { ok: false, response: authResult.response };
  }

  const session = await auth();
  let reverified = false;

  try {
    reverified =
      session.has?.({ reverification: "strict" }) ||
      session.has?.({ reverification: "moderate" }) ||
      false;
  } catch {
    reverified = false;
  }

  if (reverified) {
    return {
      ok: true,
      userId: authResult.userId,
      method: "reverification",
    };
  }

  if (input.allowExplicitConfirm && input.confirmed === true) {
    return {
      ok: true,
      userId: authResult.userId,
      method: "explicit_confirm",
    };
  }

  try {
    const response = reverificationErrorResponse("strict");
    return { ok: false, response: response as NextResponse };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Recent sign-in is required before viewing or downloading sensitive content.",
          code: "reverification_required",
        },
        { status: 403 },
      ),
    };
  }
}

/**
 * Append-only audit row for sensitive access. Never throws to callers.
 */
export async function logSensitiveAccess(
  input: LogSensitiveAccessInput,
): Promise<string | null> {
  try {
    if (!input.userId?.trim() || !input.action || !input.targetId?.trim()) {
      return null;
    }

    const db = getDb();
    const id = nanoid();
    const metadata = sanitizeAuditMetadata(input.metadata ?? {});

    await db.insert(sensitiveAccessEvents).values({
      id,
      userId: input.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata,
      createdAt: new Date(),
    });

    logger.info("sensitive_access", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      userId: input.userId,
    });

    return id;
  } catch (error) {
    console.warn("[sensitive_access] audit log failed", error);
    return null;
  }
}

/** Strip fields that must never appear in audit metadata. */
function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const blocked = new Set([
    "content",
    "password",
    "notes",
    "summaryMessage",
    "generalInstructions",
    "body",
    "url",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.has(key)) continue;
    if (typeof value === "string" && value.length > 500) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}
