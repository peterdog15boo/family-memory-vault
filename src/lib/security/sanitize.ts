/**
 * Input sanitization helpers for user-facing and admin search text.
 */

/** Escape `%` and `_` so they are literal in SQL ILIKE patterns. */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Normalize and cap a search query; returns null when empty after trim.
 */
export function sanitizeSearchQuery(
  raw: string | null | undefined,
  maxLen = 100,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().slice(0, maxLen);
  if (!trimmed) return null;
  // Strip control characters
  const cleaned = trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** Build an ILIKE pattern with escaped wildcards. */
export function likeContainsPattern(
  raw: string | null | undefined,
  maxLen = 100,
): string | null {
  const q = sanitizeSearchQuery(raw, maxLen);
  if (!q) return null;
  return `%${escapeLikePattern(q)}%`;
}

/**
 * Clamp free-text fields (titles, descriptions, names).
 * Trims, strips controls, enforces max length.
 */
export function sanitizeUserText(
  raw: string,
  maxLen: number,
): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLen);
}
