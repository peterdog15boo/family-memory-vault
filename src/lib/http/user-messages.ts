/**
 * Map API error codes → user-facing copy for client components.
 */

export type ApiErrorPayload = {
  error?: string;
  code?: string;
  retryAfterSec?: number;
};

const CODE_MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in and try again.",
  forbidden: "You don’t have permission to do that.",
  not_found: "We couldn’t find what you were looking for.",
  validation: "Please check your input and try again.",
  plan_limit: "You’ve reached a limit on your current plan.",
  quota_exceeded: "You’ve reached a usage limit. Try again later or upgrade.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  account_suspended: "This account is suspended.",
  stripe_not_configured:
    "Billing isn’t set up yet. Please try again later or contact support.",
  price_not_configured:
    "That plan isn’t available for checkout right now. Please try another plan.",
  r2_not_configured:
    "File storage isn’t configured yet. Uploads are temporarily unavailable.",
  storage_quota_exceeded:
    "Your storage is full. Free up space or upgrade to upload more.",
  unsafe: "That content can’t be used for safety reasons.",
  untrusted_origin:
    "This upload didn’t come from a trusted app address. Open the vault from your usual link (or the same Wi‑Fi address you use on your phone) and try again.",
  unsupported_type:
    "Unsupported file type. Use JPEG, PNG, WebP, HEIC, MP4, MOV, or WebM.",
  internal: "Something went wrong on our side. Please try again.",
};

/**
 * Prefer a friendly message from `code`, falling back to the API `error` string.
 */
export function userFacingApiError(
  data: ApiErrorPayload | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!data) return fallback;
  if (data.code && CODE_MESSAGES[data.code]) {
    // Keep specific quota/plan messages from the server when more precise.
    if (
      (data.code === "plan_limit" ||
        data.code === "quota_exceeded" ||
        data.code === "storage_quota_exceeded") &&
      data.error?.trim()
    ) {
      return data.error.trim();
    }
    if (data.code === "rate_limited" && data.retryAfterSec) {
      return `Too many requests. Please wait about ${data.retryAfterSec} seconds and try again.`;
    }
    return CODE_MESSAGES[data.code]!;
  }
  if (data.error?.trim()) return data.error.trim();
  return fallback;
}

/** Parse JSON error body from a failed fetch safely. */
export async function readApiError(
  response: Response,
): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return { error: response.statusText || undefined };
  }
}
