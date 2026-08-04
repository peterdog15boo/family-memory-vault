/**
 * NCMEC CyberTipline reporting service (ESP Reporting API).
 *
 * Official flow (see https://report.cybertip.org/ispws/documentation):
 *   1. POST /submit   — open a report with XML body → reportId
 *   2. POST /upload   — attach evidence file(s) for that reportId
 *   3. POST /finish   — finalize (irreversible once finished)
 *
 * ---------------------------------------------------------------------------
 * LEGAL / PRODUCTION NOTICE
 * ---------------------------------------------------------------------------
 * Real CyberTipline credentials, org approval, and qualified legal review are
 * REQUIRED before enabling production reporting (`NCMEC_REPORTING_ENABLED=true`).
 *
 * This module is NOT legal advice. Keep reporting disabled until counsel has
 * reviewed jurisdictional duties, evidence handling, retention, and the XML
 * schema fields your ESP must send. Never log or persist illegal imagery in
 * app logs, tickets, or audit metadata — store opaque ids and controlled
 * references only.
 *
 * Until live credentials are wired, functions return clearly labeled mock
 * report ids so quarantine + DB persistence can be tested safely.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import { saveNcmecReportId } from "@/lib/moderation/db";
import { quarantineMedia } from "@/lib/moderation/quarantine";
import type { ModerationResult } from "@/lib/moderation/types";
import { logNcmecFailed, logNcmecReported } from "@/lib/observability/events";

const LOG_PREFIX = "[moderation.ncmec]";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type NcmecCredentials = {
  username: string;
  password: string;
  orgId: string;
  /** Base URI, e.g. https://report.cybertip.org/ispws (prod) or ext test host */
  apiUrl: string;
  reportingEnabled: boolean;
};

/**
 * High-level fields used to build the CyberTipline report XML.
 * Map these into the official XSD in createReport() — do not invent schema.
 */
export type NcmecReportPayload = {
  mediaId: string;
  userId: string;
  /** R2 object key (quarantine/ or pre-move source) — never put bytes in logs */
  objectKey: string;
  detectedAt: Date;
  contentType?: string | null;
  originalFilename?: string | null;
  photodnaMatch?: boolean;
  aiCsamScore?: number | null;
  additionalInfo?: string;
  /** Opaque incident notes for operators / counsel-approved fields */
  incidentNotes?: string;
};

export type CreateReportResult = {
  reportId: string;
  mock: boolean;
  raw?: Record<string, unknown>;
};

export type UploadEvidenceResult = {
  reportId: string;
  fileId: string;
  mock: boolean;
};

export type FinishReportResult = {
  reportId: string;
  fileIds: string[];
  mock: boolean;
};

export type ReportCsamIncidentInput = {
  mediaId: string;
  userId: string;
  key: string;
  detectedAt?: Date;
  additionalInfo?: string;
  /** Optional scan scores to attach to the report metadata (not binary). */
  moderationResult?: ModerationResult;
  /**
   * Optional evidence bytes/stream for /upload.
   * Prefer an audited, counsel-approved evidence pipeline — do not casually
   * re-download suspected CSAM into app memory in production without review.
   */
  evidence?: Buffer | ReadableStream<Uint8Array> | null;
  evidenceFilename?: string;
  evidenceContentType?: string;
};

export type ReportCsamIncidentResult = {
  media: Media;
  reportId: string;
  mock: boolean;
  quarantined: boolean;
  finished: boolean;
};

export class NcmecReportingError extends Error {
  readonly step: string;
  readonly cause?: unknown;

  constructor(step: string, message: string, cause?: unknown) {
    super(`[NCMEC:${step}] ${message}`);
    this.name = "NcmecReportingError";
    this.step = step;
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* Credentials                                                                */
/* -------------------------------------------------------------------------- */

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  orgId: z.string().min(1),
  apiUrl: z.string().url(),
  reportingEnabled: z.boolean(),
});

/**
 * Load CyberTipline ESP credentials from environment variables.
 *
 * Required for live reporting:
 *   NCMEC_CYBERTIPLINE_USERNAME
 *   NCMEC_CYBERTIPLINE_PASSWORD
 *   NCMEC_CYBERTIPLINE_ORG_ID
 *   NCMEC_CYBERTIPLINE_API_URL   (e.g. https://report.cybertip.org/ispws)
 *   NCMEC_REPORTING_ENABLED=true
 *
 * When reporting is disabled, placeholder values are returned so local flows
 * can still exercise the pipeline without real secrets.
 */
export function loadCredentials(): NcmecCredentials {
  const reportingEnabled = process.env.NCMEC_REPORTING_ENABLED === "true";

  if (!reportingEnabled) {
    const stub: NcmecCredentials = {
      username: process.env.NCMEC_CYBERTIPLINE_USERNAME?.trim() || "mock-username",
      password: process.env.NCMEC_CYBERTIPLINE_PASSWORD?.trim() || "mock-password",
      orgId: process.env.NCMEC_CYBERTIPLINE_ORG_ID?.trim() || "mock-org",
      apiUrl:
        process.env.NCMEC_CYBERTIPLINE_API_URL?.trim() ||
        "https://exttest.cybertip.org/ispws",
      reportingEnabled: false,
    };

    console.info(`${LOG_PREFIX} loadCredentials: reporting disabled (mock mode)`, {
      orgId: stub.orgId,
      apiUrl: stub.apiUrl,
      reportingEnabled: false,
    });

    return stub;
  }

  try {
    const parsed = credentialsSchema.parse({
      username: process.env.NCMEC_CYBERTIPLINE_USERNAME?.trim(),
      password: process.env.NCMEC_CYBERTIPLINE_PASSWORD?.trim(),
      orgId: process.env.NCMEC_CYBERTIPLINE_ORG_ID?.trim(),
      apiUrl: process.env.NCMEC_CYBERTIPLINE_API_URL?.trim(),
      reportingEnabled: true,
    });

    console.info(`${LOG_PREFIX} loadCredentials: live credentials loaded`, {
      orgId: parsed.orgId,
      apiUrl: parsed.apiUrl,
      reportingEnabled: true,
      // Never log username/password.
    });

    return parsed;
  } catch (error) {
    console.error(`${LOG_PREFIX} loadCredentials failed`, { error });
    throw new NcmecReportingError(
      "loadCredentials",
      "NCMEC_REPORTING_ENABLED=true but CyberTipline env credentials are missing or invalid. Set NCMEC_CYBERTIPLINE_* and complete legal review before enabling.",
      error,
    );
  }
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function basicAuthHeader(creds: NcmecCredentials): string {
  const token = Buffer.from(`${creds.username}:${creds.password}`).toString(
    "base64",
  );
  return `Basic ${token}`;
}

/* -------------------------------------------------------------------------- */
/* XML / HTTP placeholders                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build the CyberTipline report XML document for POST /submit.
 *
 * TODO (production):
 * - Download / cache the official XSD via GET /xsd from the CyberTipline API.
 * - Map `payload` + org reporter details into elements required by the current
 *   report schema (incidentSummary, reporter, etc.).
 * - Include only counsel-approved fields; never embed binary evidence in XML.
 * - Escape all text nodes; validate against XSD before POST.
 */
function buildSubmitXmlPlaceholder(
  payload: NcmecReportPayload,
  creds: NcmecCredentials,
): string {
  // Placeholder XML — NOT valid for production submission.
  const detectedAt = payload.detectedAt.toISOString();
  const additional = [
    payload.additionalInfo,
    payload.incidentNotes,
    payload.photodnaMatch ? "photodna_match=true" : null,
    payload.aiCsamScore != null
      ? `ai_csam_score=${payload.aiCsamScore}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- TODO: Replace with schema-conformant CyberTipline report XML -->`,
    `<report>`,
    `  <orgId>${escapeXml(creds.orgId)}</orgId>`,
    `  <incident>`,
    `    <mediaId>${escapeXml(payload.mediaId)}</mediaId>`,
    `    <userId>${escapeXml(payload.userId)}</userId>`,
    `    <objectKey>${escapeXml(payload.objectKey)}</objectKey>`,
    `    <detectedAt>${escapeXml(detectedAt)}</detectedAt>`,
    `    <contentType>${escapeXml(payload.contentType ?? "")}</contentType>`,
    `    <originalFilename>${escapeXml(payload.originalFilename ?? "")}</originalFilename>`,
    `    <additionalInfo>${escapeXml(additional)}</additionalInfo>`,
    `  </incident>`,
    `</report>`,
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Parse reportId from a CyberTipline /submit (or /finish) XML/JSON response.
 *
 * TODO: Parse the real response document per NCMEC docs (typically XML with
 * responseCode + reportId). Keep parsers strict and fail closed.
 */
function parseReportIdFromResponse(
  body: string,
  fallbackMockId: string,
): string {
  // Placeholder extractors for common shapes while the real parser is TBD.
  const xmlMatch = body.match(/<reportId>\s*([^<]+)\s*<\/reportId>/i);
  if (xmlMatch?.[1]?.trim()) return xmlMatch[1].trim();

  try {
    const json = JSON.parse(body) as { reportId?: string | number };
    if (json.reportId != null) return String(json.reportId);
  } catch {
    // not JSON
  }

  return fallbackMockId;
}

/* -------------------------------------------------------------------------- */
/* API steps                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /submit — open a CyberTipline report and receive a reportId.
 *
 * TODO (production):
 * - POST `buildSubmitXmlPlaceholder` (replaced with real XSD XML) to
 *   `{apiUrl}/submit` with HTTP Basic auth.
 * - Content-Type: text/xml (or as specified by current NCMEC docs).
 * - Inspect responseCode; throw on non-success.
 * - Return the assigned reportId only — never log the full XML with PII beyond
 *   what ops policy allows.
 */
export async function createReport(
  payload: NcmecReportPayload,
): Promise<CreateReportResult> {
  const creds = loadCredentials();
  const xml = buildSubmitXmlPlaceholder(payload, creds);
  const url = endpoint(creds.apiUrl, "submit");

  console.info(`${LOG_PREFIX} createReport: starting`, {
    mediaId: payload.mediaId,
    userId: payload.userId,
    objectKey: payload.objectKey,
    detectedAt: payload.detectedAt.toISOString(),
    url,
    reportingEnabled: creds.reportingEnabled,
    xmlBytes: Buffer.byteLength(xml, "utf8"),
  });

  if (!creds.reportingEnabled) {
    const reportId = `mock-ncmec-submit-${payload.mediaId}`;
    console.info(`${LOG_PREFIX} createReport: mock submit complete`, {
      reportId,
      mediaId: payload.mediaId,
    });
    return {
      reportId,
      mock: true,
      raw: { mode: "mock", endpoint: "/submit" },
    };
  }

  try {
    // TODO: Replace this stub with a real authenticated POST of the XML body.
    //
    // const response = await fetch(url, {
    //   method: "POST",
    //   headers: {
    //     Authorization: basicAuthHeader(creds),
    //     "Content-Type": "text/xml; charset=utf-8",
    //     Accept: "text/xml",
    //   },
    //   body: xml,
    // });
    // if (!response.ok) {
    //   throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    // }
    // const body = await response.text();
    // const reportId = parseReportIdFromResponse(body, "");
    // if (!reportId) throw new Error("CyberTipline /submit returned no reportId");
    // return { reportId, mock: false, raw: { status: response.status } };

    // Keep helpers referenced so the live path scaffolding stays typechecked.
    void basicAuthHeader(creds);
    void parseReportIdFromResponse("", "");
    void url;
    void xml;

    throw new NcmecReportingError(
      "createReport",
      "Live CyberTipline /submit client is not implemented yet. Keep NCMEC_REPORTING_ENABLED=false until the XML schema mapping and HTTP client are complete and legally reviewed.",
    );
  } catch (error) {
    if (error instanceof NcmecReportingError) throw error;
    console.error(`${LOG_PREFIX} createReport failed`, {
      mediaId: payload.mediaId,
      error,
    });
    throw new NcmecReportingError(
      "createReport",
      "Failed to open CyberTipline report via /submit.",
      error,
    );
  }
}

/**
 * POST /upload — attach evidence to an open report.
 *
 * TODO (production):
 * - Multipart (or API-specified) POST to `{apiUrl}/upload` with `id=reportId`
 *   and the file body, using Basic auth.
 * - Capture returned fileId / checksums from the response.
 * - Never write evidence bytes to application logs.
 * - Prefer streaming from an audited evidence store; do not leave copies in
 *   temp dirs after upload.
 */
export async function uploadEvidence(
  reportId: string,
  file: Buffer | ReadableStream<Uint8Array>,
  options?: {
    filename?: string;
    contentType?: string;
  },
): Promise<UploadEvidenceResult> {
  if (!reportId?.trim()) {
    throw new NcmecReportingError(
      "uploadEvidence",
      "reportId is required for /upload.",
    );
  }

  const creds = loadCredentials();
  const url = endpoint(creds.apiUrl, "upload");
  const filename = options?.filename ?? "evidence.bin";
  const contentType = options?.contentType ?? "application/octet-stream";
  const sizeHint =
    Buffer.isBuffer(file) ? file.byteLength : undefined;

  console.info(`${LOG_PREFIX} uploadEvidence: starting`, {
    reportId,
    filename,
    contentType,
    sizeHint,
    url,
    reportingEnabled: creds.reportingEnabled,
  });

  if (!creds.reportingEnabled) {
    const fileId = `mock-file-${reportId}`;
    console.info(`${LOG_PREFIX} uploadEvidence: mock upload complete`, {
      reportId,
      fileId,
    });
    return { reportId, fileId, mock: true };
  }

  try {
    // TODO: Stream/multipart upload to CyberTipline /upload.
    //
    // const form = new FormData();
    // form.set("id", reportId);
    // form.set("file", new Blob([file as BlobPart], { type: contentType }), filename);
    // const response = await fetch(url, {
    //   method: "POST",
    //   headers: { Authorization: basicAuthHeader(creds) },
    //   body: form,
    // });
    // ...parse fileId from XML response...

    void url;
    void file;
    void filename;
    void contentType;

    throw new NcmecReportingError(
      "uploadEvidence",
      "Live CyberTipline /upload client is not implemented yet. Keep NCMEC_REPORTING_ENABLED=false until evidence upload is reviewed and implemented.",
    );
  } catch (error) {
    if (error instanceof NcmecReportingError) throw error;
    console.error(`${LOG_PREFIX} uploadEvidence failed`, { reportId, error });
    throw new NcmecReportingError(
      "uploadEvidence",
      "Failed to upload evidence via CyberTipline /upload.",
      error,
    );
  }
}

/**
 * POST /finish — finalize an open report (irreversible for that report id).
 *
 * TODO (production):
 * - POST `{apiUrl}/finish` with report id parameter per NCMEC docs.
 * - Confirm success responseCode and persist returned file id list if needed.
 * - Unfinished reports may be auto-deleted by NCMEC after their retention
 *   window — always finish after evidence upload when filing for real.
 */
export async function finishReport(
  reportId: string,
): Promise<FinishReportResult> {
  if (!reportId?.trim()) {
    throw new NcmecReportingError(
      "finishReport",
      "reportId is required for /finish.",
    );
  }

  const creds = loadCredentials();
  const url = endpoint(creds.apiUrl, "finish");

  console.info(`${LOG_PREFIX} finishReport: starting`, {
    reportId,
    url,
    reportingEnabled: creds.reportingEnabled,
  });

  if (!creds.reportingEnabled) {
    console.info(`${LOG_PREFIX} finishReport: mock finish complete`, {
      reportId,
    });
    return { reportId, fileIds: [], mock: true };
  }

  try {
    // TODO: Authenticated POST to /finish with report id.
    //
    // const response = await fetch(url, {
    //   method: "POST",
    //   headers: {
    //     Authorization: basicAuthHeader(creds),
    //     "Content-Type": "application/x-www-form-urlencoded",
    //   },
    //   body: new URLSearchParams({ id: reportId }),
    // });
    // ...parse success + fileIds...

    void url;

    throw new NcmecReportingError(
      "finishReport",
      "Live CyberTipline /finish client is not implemented yet. Keep NCMEC_REPORTING_ENABLED=false until the finish step is implemented and legally reviewed.",
    );
  } catch (error) {
    if (error instanceof NcmecReportingError) throw error;
    console.error(`${LOG_PREFIX} finishReport failed`, { reportId, error });
    throw new NcmecReportingError(
      "finishReport",
      "Failed to finish CyberTipline report via /finish.",
      error,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* High-level incident reporter                                               */
/* -------------------------------------------------------------------------- */

/**
 * End-to-end CSAM incident handling for a single media object.
 *
 * 1. Quarantine the media (R2 move + DB status + audit)
 * 2. Collect basic metadata (no binary content in logs)
 * 3. CyberTipline flow: createReport → optional uploadEvidence → finishReport
 * 4. Persist the returned reportId on the media row
 *
 * Safe for local testing with `NCMEC_REPORTING_ENABLED=false` (mock ids).
 * Do not enable live reporting without real credentials and legal review.
 */
export async function reportCsamIncident(
  input: ReportCsamIncidentInput,
): Promise<ReportCsamIncidentResult> {
  const {
    mediaId,
    userId,
    key,
    additionalInfo,
    moderationResult,
    evidence,
    evidenceFilename,
    evidenceContentType,
  } = input;
  const detectedAt = input.detectedAt ?? new Date();

  if (!mediaId?.trim() || !userId?.trim() || !key?.trim()) {
    throw new NcmecReportingError(
      "reportCsamIncident",
      "mediaId, userId, and key are required.",
    );
  }

  console.info(`${LOG_PREFIX} reportCsamIncident: start`, {
    mediaId,
    userId,
    key,
    detectedAt: detectedAt.toISOString(),
    hasEvidence: Boolean(evidence),
  });

  // Idempotent: already reported — do not open a second CyberTipline case.
  {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(media)
      .where(eq(media.id, mediaId))
      .limit(1);
    if (existing?.ncmecReportId?.trim()) {
      console.info(`${LOG_PREFIX} reportCsamIncident: already reported`, {
        mediaId,
        reportId: existing.ncmecReportId,
      });
      return {
        media: existing,
        reportId: existing.ncmecReportId,
        mock: existing.ncmecReportId.startsWith("mock-"),
        quarantined: existing.moderationStatus === "csam_quarantined",
        finished: true,
      };
    }
  }

  // 1. Quarantine (idempotent if already under quarantine/)
  let quarantinedMedia: Media;
  try {
    const quarantine = await quarantineMedia(
      mediaId,
      additionalInfo?.trim() ||
        "CSAM detected — quarantined for CyberTipline reporting.",
      moderationResult,
    );
    quarantinedMedia = quarantine.media;
    console.info(`${LOG_PREFIX} reportCsamIncident: quarantine complete`, {
      mediaId,
      quarantineKey: quarantinedMedia.originalKey,
      storageMoveFailed: quarantine.storageMoveFailed,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} reportCsamIncident: quarantine failed`, {
      mediaId,
      error,
    });
    throw new NcmecReportingError(
      "reportCsamIncident",
      "Failed to quarantine media before NCMEC reporting.",
      error,
    );
  }

  // Ownership check after quarantine (row is source of truth)
  if (quarantinedMedia.userId !== userId) {
    throw new NcmecReportingError(
      "reportCsamIncident",
      `userId mismatch for media ${mediaId}: expected owner ${quarantinedMedia.userId}.`,
    );
  }

  // 2. Collect basic metadata (ids / labels only — never binary)
  const payload: NcmecReportPayload = {
    mediaId,
    userId,
    objectKey: quarantinedMedia.originalKey || key,
    detectedAt,
    contentType: quarantinedMedia.contentType,
    originalFilename: quarantinedMedia.originalFilename,
    photodnaMatch:
      moderationResult?.photodnaMatch ?? quarantinedMedia.photodnaMatch,
    aiCsamScore:
      moderationResult?.aiCsamScore ?? quarantinedMedia.aiCsamScore,
    additionalInfo,
    incidentNotes: moderationResult?.notes,
  };

  console.info(`${LOG_PREFIX} reportCsamIncident: metadata collected`, {
    mediaId: payload.mediaId,
    userId: payload.userId,
    objectKey: payload.objectKey,
    contentType: payload.contentType,
    photodnaMatch: payload.photodnaMatch,
    aiCsamScore: payload.aiCsamScore,
    // Intentionally omit originalFilename from default info logs if sensitive;
    // include only in debug when ops policy allows.
  });

  // 3. CyberTipline API flow
  let created: CreateReportResult;
  try {
    created = await createReport(payload);
  } catch (error) {
    // Quarantine already happened — keep media quarantined and surface a retryable
    // error so the worker can resume NCMEC without re-scanning family content.
    console.error(
      `${LOG_PREFIX} reportCsamIncident: createReport failed (media remains quarantined)`,
      {
        mediaId,
        quarantineKey: quarantinedMedia.originalKey,
        error,
      },
    );
    logNcmecFailed({ mediaId, userId, stage: "submit" }, error);
    throw error instanceof NcmecReportingError
      ? error
      : new NcmecReportingError(
          "reportCsamIncident",
          "CyberTipline /submit failed after quarantine — will retry reporting.",
          error,
        );
  }

  let finished = false;
  try {
    if (evidence) {
      await uploadEvidence(created.reportId, evidence, {
        filename:
          evidenceFilename ??
          quarantinedMedia.originalFilename ??
          "evidence.bin",
        contentType:
          evidenceContentType ??
          quarantinedMedia.contentType ??
          "application/octet-stream",
      });
    } else {
      console.info(
        `${LOG_PREFIX} reportCsamIncident: skipping /upload (no evidence buffer provided)`,
        {
          mediaId,
          reportId: created.reportId,
          // TODO: Wire an audited evidence fetch for quarantine keys when
          // counsel approves a controlled upload path.
        },
      );
    }

    await finishReport(created.reportId);
    finished = true;
  } catch (error) {
    // Report was opened but not finished — log loudly for operator follow-up.
    // Unfinished CyberTipline reports may expire if not finished in time.
    console.error(
      `${LOG_PREFIX} reportCsamIncident: upload/finish failed after /submit`,
      {
        mediaId,
        reportId: created.reportId,
        error,
      },
    );
    logNcmecFailed(
      { mediaId, userId, reportId: created.reportId, stage: "upload_or_finish" },
      error,
    );
    throw error instanceof NcmecReportingError
      ? error
      : new NcmecReportingError(
          "reportCsamIncident",
          `CyberTipline report ${created.reportId} was opened but not finished.`,
          error,
        );
  }

  // 4. Persist report id
  let saved: Media;
  try {
    saved = await saveNcmecReportId(mediaId, created.reportId);
  } catch (error) {
    console.error(
      `${LOG_PREFIX} reportCsamIncident: failed to persist reportId`,
      {
        mediaId,
        reportId: created.reportId,
        error,
      },
    );
    logNcmecFailed(
      { mediaId, userId, reportId: created.reportId, stage: "persist" },
      error,
    );
    throw new NcmecReportingError(
      "reportCsamIncident",
      `CyberTipline report ${created.reportId} finished but could not be saved to the database.`,
      error,
    );
  }

  console.info(`${LOG_PREFIX} reportCsamIncident: complete`, {
    mediaId,
    reportId: created.reportId,
    mock: created.mock,
    finished,
    ncmecReportedAt: saved.ncmecReportedAt?.toISOString() ?? null,
  });
  logNcmecReported({
    mediaId,
    userId,
    reportId: created.reportId,
    mock: created.mock,
    finished,
  });

  return {
    media: saved,
    reportId: created.reportId,
    mock: created.mock,
    quarantined: true,
    finished,
  };
}

/**
 * Convenience used by the moderation pipeline when only mediaId + key are known.
 * Loads the media owner from the database, then calls reportCsamIncident.
 */
export async function reportCsamIncidentForMedia(
  mediaId: string,
  key: string,
  options?: {
    detectedAt?: Date;
    additionalInfo?: string;
    moderationResult?: ModerationResult;
  },
): Promise<ReportCsamIncidentResult> {
  const db = getDb();
  const [row] = await db
    .select({
      id: media.id,
      userId: media.userId,
      originalKey: media.originalKey,
    })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    throw new NcmecReportingError(
      "reportCsamIncidentForMedia",
      `Media not found: ${mediaId}`,
    );
  }

  return reportCsamIncident({
    mediaId: row.id,
    userId: row.userId,
    key: key || row.originalKey,
    detectedAt: options?.detectedAt,
    additionalInfo: options?.additionalInfo,
    moderationResult: options?.moderationResult,
  });
}
