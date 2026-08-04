/**
 * Browser-safe Private Documents constants (no R2 / sharp imports).
 */

export const PRIVATE_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export const PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/rtf",
] as const;

export type PrivateDocumentAllowedContentType =
  (typeof PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES)[number];
