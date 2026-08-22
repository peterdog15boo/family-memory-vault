/**
 * Consistent API error responses for route handlers.
 *
 * Body shape:
 *   { error: string; code?: string; details?: unknown }
 */

import { NextResponse } from "next/server";
import { FamilyError } from "@/lib/families";
import { DocumentsError } from "@/lib/documents";
import { PrivateDocumentStorageError } from "@/lib/documents/storage";
import { LegacyError } from "@/lib/legacy";
import { LegacyVideoStorageError } from "@/lib/legacy/video-storage";
import { EmergencyAccessError } from "@/lib/emergency-access";
import { MediaError } from "@/lib/media/errors";
import { MemoryError } from "@/lib/memories/errors";
import { MovieError } from "@/lib/movies/errors";
import { PeopleError } from "@/lib/people";
import { logger } from "@/lib/observability/logger";
import { PlanGateError } from "@/lib/plans/gates";
import { StripeBillingError } from "@/lib/stripe/subscriptions";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "plan_limit"
  | "quota_exceeded"
  | "rate_limited"
  | "account_suspended"
  | "conflict"
  | "stripe_not_configured"
  | "price_not_configured"
  | "r2_not_configured"
  | "storage_quota_exceeded"
  | "unsafe"
  | "internal";

export type ApiErrorBody = {
  error: string;
  code?: ApiErrorCode | string;
  details?: unknown;
};

export type ApiErrorOptions = {
  status?: number;
  code?: ApiErrorCode | string;
  details?: unknown;
  headers?: HeadersInit;
};

/** Build a JSON error NextResponse. */
export function apiError(
  message: string,
  options: ApiErrorOptions = {},
): NextResponse {
  const status = options.status ?? 400;
  const body: ApiErrorBody = { error: message };
  if (options.code) body.code = options.code;
  if (options.details !== undefined) body.details = options.details;
  return NextResponse.json(body, {
    status,
    headers: options.headers,
  });
}

/** Map known domain errors to a consistent response; otherwise 500. */
export function apiErrorFromUnknown(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  if (error instanceof MovieError) {
    let status = 400;
    if (error.code === "quota_exceeded") status = 429;
    else if (error.code === "plan_limit") status = 403;
    else if (error.code === "not_found") status = 404;
    else if (error.code === "unsafe") status = 403;
    return apiError(error.message, { status, code: error.code ?? "validation" });
  }

  if (error instanceof MediaError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden" || error.code === "unsafe"
          ? 403
          : error.code === "conflict"
            ? 409
            : 400;
    return apiError(error.message, {
      status,
      code: error.code ?? "validation",
    });
  }

  if (error instanceof FamilyError) {
    let status = 400;
    if (error.code === "plan_limit") status = 403;
    else if (error.code === "not_found") status = 404;
    else if (error.code === "forbidden") status = 403;
    else if (
      !error.code &&
      (error.message === "Family not found." ||
        error.message === "Invite not found or already used." ||
        error.message.includes("Family member not found"))
    ) {
      status = 404;
    } else if (
      !error.code &&
      (error.message.includes("Only an active") ||
        error.message.includes("Owners cannot") ||
        error.message.includes("not an active member") ||
        error.message.includes("different email"))
    ) {
      status = 403;
    }
    return apiError(error.message, {
      status,
      code: error.code ?? (status === 404 ? "not_found" : status === 403 ? "forbidden" : "validation"),
    });
  }

  if (error instanceof PeopleError) {
    const status =
      error.code === "plan_limit"
        ? 403
        : error.code === "not_found" || error.message === "Person not found."
          ? 404
          : 400;
    return apiError(error.message, {
      status,
      code:
        error.code ??
        (status === 404 ? "not_found" : status === 403 ? "plan_limit" : "validation"),
    });
  }

  if (error instanceof MemoryError) {
    const status =
      error.code === "not_found" || error.message === "Memory not found."
        ? 404
        : error.code === "forbidden"
          ? 403
          : 400;
    return apiError(error.message, {
      status,
      code: error.code ?? (status === 404 ? "not_found" : "validation"),
    });
  }

  if (error instanceof LegacyError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : 400;
    return apiError(error.message, {
      status,
      code: error.code ?? "validation",
    });
  }

  if (error instanceof EmergencyAccessError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : error.code === "conflict"
            ? 409
            : 400;
    return apiError(error.message, {
      status,
      code: error.code ?? "validation",
    });
  }

  if (error instanceof DocumentsError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : error.code === "conflict"
            ? 409
            : 400;
    return apiError(error.message, {
      status,
      code: error.code ?? "validation",
    });
  }

  if (error instanceof PrivateDocumentStorageError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : error.code === "unsupported"
            ? 400
            : 400;
    return apiError(error.message, {
      status,
      code: error.code,
    });
  }

  if (error instanceof LegacyVideoStorageError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : 400;
    return apiError(error.message, {
      status,
      code: error.code,
    });
  }

  if (error instanceof StripeBillingError) {
    const status =
      error.code === "stripe_not_configured" ||
      error.code === "price_not_configured"
        ? 503
        : error.code === "not_found"
          ? 404
          : 400;
    return apiError(error.message, { status, code: error.code });
  }

  if (error instanceof PlanGateError) {
    return apiError(error.message, {
      status: 403,
      code: error.code ?? "plan_limit",
      details: {
        upgradeHint: error.gate.upgradeHint,
        planSlug: error.gate.planSlug,
        planName: error.gate.planName,
      },
    });
  }

  console.error(fallbackMessage, error);
  logger.error("api.unhandled_error", {
    message: fallbackMessage,
    errorName: error instanceof Error ? error.name : "unknown",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  return apiError(fallbackMessage, { status: 500, code: "internal" });
}

/** Structured log for critical paths (upload, jobs, webhooks). */
export function logCritical(
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  logger.error(`critical.${scope}`, { message, ...meta });
}

export function logInfo(
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  logger.info(scope, { message, ...meta });
}
