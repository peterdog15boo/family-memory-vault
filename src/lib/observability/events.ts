/**
 * Domain event helpers — keep event names stable for dashboards/alerts.
 */

import { errorFields, logger, type LogFields } from "@/lib/observability/logger";

export const LogEvents = {
  httpRequest: "http.request",
  healthCheck: "health.check",
  uploadUrlIssued: "upload.url_issued",
  uploadCompleted: "upload.completed",
  uploadFailed: "upload.failed",
  moderationDecision: "moderation.decision",
  moderationJobFailed: "moderation.job_failed",
  quarantineCompleted: "moderation.quarantine_completed",
  quarantineFailed: "moderation.quarantine_failed",
  ncmecReported: "moderation.ncmec_reported",
  ncmecFailed: "moderation.ncmec_failed",
  movieQueued: "movie.queued",
  movieReady: "movie.ready",
  movieFailed: "movie.failed",
  movieJobFailed: "movie.job_failed",
  /** First Family Movie onboarding funnel (payload.funnelEvent = step name). */
  firstMovieFunnel: "first_movie.funnel",
  facesJobFailed: "faces.job_failed",
  sceneJobFailed: "scene.job_failed",
  plaidJobFailed: "plaid.job_failed",
  billingWebhook: "billing.webhook",
  billingWebhookFailed: "billing.webhook_failed",
  workerDrain: "worker.drain",
  assistantTurn: "assistant.turn",
  assistantAction: "assistant.action",
  assistantConfirm: "assistant.confirm",
  assistantFailed: "assistant.failed",
  /** Private documents — never log signed URLs or full object payloads. */
  privateDocumentUploadUrlIssued: "documents.upload_url_issued",
  privateDocumentDownloadUrlIssued: "documents.download_url_issued",
  privateDocumentPromoted: "documents.promoted",
  privateDocumentThumbnailGenerated: "documents.thumbnail_generated",
  privateDocumentThumbnailSkipped: "documents.thumbnail_skipped",
  privateDocumentObjectsDeleted: "documents.objects_deleted",
  privateDocumentReplaced: "documents.replaced",
  privateDocumentTempDiscarded: "documents.temp_discarded",
  privateDocumentAccessDenied: "documents.access_denied",
  /** Digital Legacy videos — never log signed URLs or full object payloads. */
  legacyVideoUploadUrlIssued: "legacy.video.upload_url_issued",
  legacyVideoPlaybackUrlIssued: "legacy.video.playback_url_issued",
  legacyVideoPromoted: "legacy.video.promoted",
  legacyVideoThumbnailGenerated: "legacy.video.thumbnail_generated",
  legacyVideoThumbnailSkipped: "legacy.video.thumbnail_skipped",
  legacyVideoObjectDeleted: "legacy.video.object_deleted",
  legacyVideoObjectsDeleted: "legacy.video.objects_deleted",
} as const;

export type LogEvent = (typeof LogEvents)[keyof typeof LogEvents];

export function logUploadCompleted(fields: LogFields): void {
  logger.info(LogEvents.uploadCompleted, fields);
}

export function logUploadFailed(fields: LogFields, error?: unknown): void {
  logger.error(LogEvents.uploadFailed, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logModerationDecision(fields: LogFields): void {
  logger.info(LogEvents.moderationDecision, fields);
}

export function logQuarantineCompleted(fields: LogFields): void {
  logger.warn(LogEvents.quarantineCompleted, fields);
}

export function logQuarantineFailed(fields: LogFields, error?: unknown): void {
  logger.error(LogEvents.quarantineFailed, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logMovieQueued(fields: LogFields): void {
  logger.info(LogEvents.movieQueued, fields);
}

export function logMovieReady(fields: LogFields): void {
  logger.info(LogEvents.movieReady, fields);
}

export function logMovieFailed(fields: LogFields, error?: unknown): void {
  logger.error(LogEvents.movieFailed, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logNcmecReported(fields: LogFields): void {
  logger.warn(LogEvents.ncmecReported, fields);
}

export function logNcmecFailed(fields: LogFields, error?: unknown): void {
  logger.error(LogEvents.ncmecFailed, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logJobFailure(
  event:
    | typeof LogEvents.moderationJobFailed
    | typeof LogEvents.movieJobFailed
    | typeof LogEvents.facesJobFailed
    | typeof LogEvents.sceneJobFailed
    | typeof LogEvents.plaidJobFailed,
  fields: LogFields,
  error?: unknown,
): void {
  logger.error(event, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logBillingWebhook(fields: LogFields): void {
  logger.info(LogEvents.billingWebhook, fields);
}

export function logBillingWebhookFailed(fields: LogFields, error?: unknown): void {
  logger.error(LogEvents.billingWebhookFailed, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logAssistantTurn(fields: LogFields): void {
  logger.info(LogEvents.assistantTurn, fields);
}

export function logAssistantActionEvent(fields: LogFields): void {
  logger.info(LogEvents.assistantAction, fields);
}

export function logAssistantConfirm(fields: LogFields): void {
  logger.info(LogEvents.assistantConfirm, fields);
}

export function logAssistantFailed(fields: LogFields, error?: unknown): void {
  logger.error(LogEvents.assistantFailed, {
    ...fields,
    ...(error ? errorFields(error) : {}),
  });
}

export function logPrivateDocumentAccessDenied(fields: LogFields): void {
  logger.warn(LogEvents.privateDocumentAccessDenied, fields);
}
