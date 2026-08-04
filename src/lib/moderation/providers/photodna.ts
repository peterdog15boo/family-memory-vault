/**
 * Microsoft PhotoDNA Cloud Service client.
 *
 * PhotoDNA hashes images and compares them against known CSAM signature sets.
 * It is NOT facial recognition and cannot reconstruct an image from a hash.
 *
 * ---------------------------------------------------------------------------
 * How to obtain credentials (free for qualified organizations)
 * ---------------------------------------------------------------------------
 * 1. Review: https://www.microsoft.com/en-us/photodna
 * 2. Apply for the PhotoDNA Cloud Service — Microsoft states it is free for
 *    qualified organizations, businesses, non-profits, and law enforcement
 *    after application / vetting.
 * 3. Once approved, open the PhotoDNA API Management portal to obtain your
 *    subscription key and the exact Match endpoint URL for your tenant.
 * 4. Set env vars (see `.env.example`):
 *      PHOTODNA_ENABLED=true
 *      PHOTODNA_API_KEY=<Ocp-Apim-Subscription-Key>
 *      PHOTODNA_API_URL=https://api.microsoftmoderator.com/photodna/v1.0/Match
 *    Optional:
 *      PHOTODNA_ENHANCE=true          // append ?enhance for enhanced match
 *      PHOTODNA_MATCH_MODE=binary|url // default binary (recommended for private R2)
 *
 * Never ship credentials to the browser. Never log image bytes or suspected
 * CSAM content — only opaque ids / IsMatch / TrackingId / status codes.
 *
 * Official docs (portal samples after onboarding):
 *   https://www.microsoft.com/en-us/photodna/documentation
 */

import { z } from "zod";
import { getModerationMockScenario } from "@/lib/moderation/mock-scenario";
import { getInternalDownloadUrl, getObjectBytes } from "@/lib/r2";

const LOG = "[moderation.photodna]";

/** Default Match endpoint used by many PhotoDNA Cloud Service subscribers. */
export const DEFAULT_PHOTODNA_MATCH_URL =
  "https://api.microsoftmoderator.com/photodna/v1.0/Match";

export type PhotoDnaMatchInput =
  | { buffer: Buffer; contentType?: string; key?: string }
  | { key: string; buffer?: undefined };

export type PhotoDnaMatchResult = {
  match: boolean;
  /** Present when the vendor returns a tracking / correlation id */
  trackingId?: string | null;
  /** Optional distance / confidence if exposed by the tenant response */
  confidence?: number | null;
  statusCode?: number | null;
  statusDescription?: string | null;
  provider: string;
  /** Sanitized vendor payload for audit — never includes image bytes */
  raw?: Record<string, unknown>;
  notes?: string;
  mock: boolean;
};

export class PhotoDnaError extends Error {
  readonly step: string;
  readonly cause?: unknown;

  constructor(step: string, message: string, cause?: unknown) {
    super(`[PhotoDNA:${step}] ${message}`);
    this.name = "PhotoDnaError";
    this.step = step;
    this.cause = cause;
  }
}

const credentialsSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().min(8),
  enabled: z.literal(true),
  enhance: z.boolean(),
  matchMode: z.enum(["binary", "url"]),
});

export type PhotoDnaCredentials = z.infer<typeof credentialsSchema>;

/**
 * True when live PhotoDNA should be used (flag + key present).
 * Local/dev defaults to mock when disabled or incomplete.
 */
export function isPhotoDnaEnabled(): boolean {
  if (process.env.PHOTODNA_ENABLED !== "true") return false;
  const key = process.env.PHOTODNA_API_KEY?.trim();
  return Boolean(key && key.length >= 8 && !key.includes("your_photodna"));
}

export function loadPhotoDnaCredentials(): PhotoDnaCredentials | null {
  if (!isPhotoDnaEnabled()) {
    console.info(`${LOG} disabled — using mock / local fallback`, {
      PHOTODNA_ENABLED: process.env.PHOTODNA_ENABLED ?? "unset",
    });
    return null;
  }

  try {
    return credentialsSchema.parse({
      apiUrl: (
        process.env.PHOTODNA_API_URL?.trim() || DEFAULT_PHOTODNA_MATCH_URL
      ).replace(/\/+$/, ""),
      apiKey: process.env.PHOTODNA_API_KEY?.trim(),
      enabled: true,
      enhance: process.env.PHOTODNA_ENHANCE === "true",
      matchMode:
        process.env.PHOTODNA_MATCH_MODE?.trim().toLowerCase() === "url"
          ? "url"
          : "binary",
    });
  } catch (error) {
    console.error(`${LOG} credentials invalid while PHOTODNA_ENABLED=true`, {
      error,
    });
    throw new PhotoDnaError(
      "loadCredentials",
      "PHOTODNA_ENABLED=true but PHOTODNA_API_KEY / PHOTODNA_API_URL are missing or invalid.",
      error,
    );
  }
}

function isLikelyVideoKey(key: string, contentType?: string): boolean {
  if (contentType?.toLowerCase().startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(key);
}

function isLikelyImageBuffer(buffer: Buffer, contentType?: string): boolean {
  if (contentType?.toLowerCase().startsWith("image/")) return true;
  // Magic bytes: JPEG, PNG, GIF, WEBP, BMP
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return true;
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }
  return false;
}

/**
 * Sanitize vendor JSON for logs/audit — drop any accidental large Value fields.
 */
function sanitizePhotoDnaResponse(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...body };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("value") ||
      lower.includes("image") ||
      lower.includes("binary") ||
      lower.includes("content")
    ) {
      const val = clone[key];
      if (typeof val === "string" && val.length > 256) {
        clone[key] = `[redacted ${val.length} chars]`;
      }
    }
  }
  return clone;
}

function parseMatchResponse(body: Record<string, unknown>): {
  match: boolean;
  trackingId?: string | null;
  confidence?: number | null;
  statusCode?: number | null;
  statusDescription?: string | null;
} {
  const status =
    body.Status && typeof body.Status === "object"
      ? (body.Status as Record<string, unknown>)
      : null;

  const statusCode =
    typeof status?.Code === "number"
      ? status.Code
      : typeof body.StatusCode === "number"
        ? body.StatusCode
        : null;

  const statusDescription =
    typeof status?.Description === "string"
      ? status.Description
      : typeof body.StatusDescription === "string"
        ? body.StatusDescription
        : null;

  const trackingId =
    typeof body.TrackingId === "string"
      ? body.TrackingId
      : typeof body.trackingId === "string"
        ? body.trackingId
        : null;

  const confidence =
    typeof body.Confidence === "number"
      ? body.Confidence
      : typeof body.MatchConfidence === "number"
        ? body.MatchConfidence
        : null;

  // Primary signal from PhotoDNA Match
  if (typeof body.IsMatch === "boolean") {
    return {
      match: body.IsMatch,
      trackingId,
      confidence,
      statusCode,
      statusDescription,
    };
  }

  // Some tenants nest match under Result / AdvancedMatchResult
  const nested =
    (body.Result && typeof body.Result === "object"
      ? (body.Result as Record<string, unknown>)
      : null) ??
    (body.AdvancedMatchResult && typeof body.AdvancedMatchResult === "object"
      ? (body.AdvancedMatchResult as Record<string, unknown>)
      : null);

  if (nested && typeof nested.IsMatch === "boolean") {
    return {
      match: nested.IsMatch,
      trackingId,
      confidence:
        typeof nested.Confidence === "number" ? nested.Confidence : confidence,
      statusCode,
      statusDescription,
    };
  }

  // Fail closed if the response shape is unexpected while live mode is on.
  throw new PhotoDnaError(
    "parseResponse",
    `PhotoDNA Match response missing IsMatch (statusCode=${statusCode ?? "n/a"}).`,
  );
}

async function resolveImageBuffer(
  input: PhotoDnaMatchInput,
): Promise<{ buffer: Buffer; contentType?: string; key?: string }> {
  if ("buffer" in input && input.buffer) {
    return {
      buffer: input.buffer,
      contentType: input.contentType,
      key: "key" in input ? input.key : undefined,
    };
  }

  if ("key" in input && input.key) {
    console.info(`${LOG} downloading object bytes from R2`, {
      key: input.key,
      byteHint: true,
    });
    const object = await getObjectBytes(input.key);
    return {
      buffer: object.body,
      contentType: object.contentType,
      key: object.key,
    };
  }

  throw new PhotoDnaError(
    "resolveInput",
    "PhotoDNA match requires either an image buffer or an R2 object key.",
  );
}

/**
 * Call Microsoft PhotoDNA Match with image bytes (preferred for private R2).
 *
 * Request shape (API Management / microsoftmoderator):
 *   POST {PHOTODNA_API_URL}
 *   Headers: Ocp-Apim-Subscription-Key, Content-Type: application/json
 *   Body: { "DataRepresentation": "Binary", "Value": "<base64>" }
 *
 * Optional enhanced detection: append `?enhance` when PHOTODNA_ENHANCE=true.
 */
async function matchBinary(
  creds: PhotoDnaCredentials,
  buffer: Buffer,
): Promise<PhotoDnaMatchResult> {
  const url = creds.enhance ? `${creds.apiUrl}?enhance` : creds.apiUrl;
  const payload = {
    DataRepresentation: "Binary",
    Value: buffer.toString("base64"),
  };

  console.info(`${LOG} Match (binary) starting`, {
    url: creds.apiUrl,
    enhance: creds.enhance,
    bytes: buffer.byteLength,
    // Never log base64 / image content.
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": creds.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new PhotoDnaError(
      "matchBinary",
      `PhotoDNA returned non-JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok) {
    console.error(`${LOG} Match (binary) HTTP error`, {
      status: response.status,
      sanitized: sanitizePhotoDnaResponse(json),
    });
    throw new PhotoDnaError(
      "matchBinary",
      `PhotoDNA Match failed with HTTP ${response.status}.`,
    );
  }

  const parsed = parseMatchResponse(json);
  const sanitized = sanitizePhotoDnaResponse(json);

  console.info(`${LOG} Match (binary) complete`, {
    match: parsed.match,
    trackingId: parsed.trackingId,
    statusCode: parsed.statusCode,
  });

  return {
    match: parsed.match,
    trackingId: parsed.trackingId,
    confidence: parsed.confidence ?? (parsed.match ? 1 : 0),
    statusCode: parsed.statusCode,
    statusDescription: parsed.statusDescription,
    provider: "photodna.cloud",
    raw: sanitized,
    notes: parsed.match
      ? "PhotoDNA hash match against known CSAM signatures."
      : "No PhotoDNA hash match.",
    mock: false,
  };
}

/**
 * Call PhotoDNA Match with a URL PhotoDNA can fetch.
 * Only use when the URL is reachable by Microsoft (e.g. short-lived signed GET).
 * Private buckets without public access should prefer binary mode.
 */
async function matchUrl(
  creds: PhotoDnaCredentials,
  imageUrl: string,
): Promise<PhotoDnaMatchResult> {
  const url = creds.enhance ? `${creds.apiUrl}?enhance` : creds.apiUrl;
  const payload = {
    DataRepresentation: "URL",
    Value: imageUrl,
  };

  console.info(`${LOG} Match (url) starting`, {
    url: creds.apiUrl,
    enhance: creds.enhance,
    // Do not log the full signed URL (contains signature query params).
    imageUrlHost: (() => {
      try {
        return new URL(imageUrl).host;
      } catch {
        return "invalid-url";
      }
    })(),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": creds.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new PhotoDnaError(
      "matchUrl",
      `PhotoDNA returned non-JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok) {
    console.error(`${LOG} Match (url) HTTP error`, {
      status: response.status,
      sanitized: sanitizePhotoDnaResponse(json),
    });
    throw new PhotoDnaError(
      "matchUrl",
      `PhotoDNA Match failed with HTTP ${response.status}.`,
    );
  }

  const parsed = parseMatchResponse(json);

  console.info(`${LOG} Match (url) complete`, {
    match: parsed.match,
    trackingId: parsed.trackingId,
    statusCode: parsed.statusCode,
  });

  return {
    match: parsed.match,
    trackingId: parsed.trackingId,
    confidence: parsed.confidence ?? (parsed.match ? 1 : 0),
    statusCode: parsed.statusCode,
    statusDescription: parsed.statusDescription,
    provider: "photodna.cloud",
    raw: sanitizePhotoDnaResponse(json),
    notes: parsed.match
      ? "PhotoDNA hash match against known CSAM signatures."
      : "No PhotoDNA hash match.",
    mock: false,
  };
}

/**
 * Local/dev mock — used when PhotoDNA is not enabled.
 * Honors MODERATION_MOCK_SCENARIO=csam to exercise the CSAM path.
 */
export function matchWithPhotoDnaMock(keyOrHint?: string): PhotoDnaMatchResult {
  const scenario = getModerationMockScenario();
  const match = scenario === "csam";

  console.info(`${LOG} mock match`, {
    scenario,
    match,
    key: keyOrHint ?? null,
  });

  return {
    match,
    confidence: match ? 1 : 0,
    trackingId: match ? `mock-tracking-${Date.now()}` : null,
    provider: "photodna.mock",
    raw: {
      mock: true,
      scenario,
      note: "Set PHOTODNA_ENABLED=true with a real subscription key for live Match.",
    },
    notes: match
      ? "MOCK: PhotoDNA hash match (MODERATION_MOCK_SCENARIO=csam)."
      : "MOCK: No PhotoDNA match.",
    mock: true,
  };
}

/**
 * Run PhotoDNA Match against an image buffer or R2 object key.
 *
 * - Live mode when PHOTODNA_ENABLED=true + credentials
 * - Mock fallback otherwise (local development)
 *
 * PhotoDNA is image-oriented. Video keys are skipped (no match) with a note
 * so the AI moderation step can still score the asset.
 */
export async function matchWithPhotoDna(
  input: PhotoDnaMatchInput | string,
): Promise<PhotoDnaMatchResult> {
  const normalized: PhotoDnaMatchInput =
    typeof input === "string" ? { key: input } : input;

  const creds = loadPhotoDnaCredentials();
  if (!creds) {
    const hint =
      "key" in normalized && normalized.key
        ? normalized.key
        : "buffer" in normalized
          ? "buffer"
          : undefined;
    return matchWithPhotoDnaMock(hint);
  }

  try {
    if (creds.matchMode === "url") {
      if (!("key" in normalized) || !normalized.key) {
        throw new PhotoDnaError(
          "matchUrl",
          "PHOTODNA_MATCH_MODE=url requires an R2 object key (to mint an internal download URL).",
        );
      }

      if (isLikelyVideoKey(normalized.key)) {
        console.info(`${LOG} skipping video key (PhotoDNA is image-based)`, {
          key: normalized.key,
        });
        return {
          match: false,
          confidence: 0,
          provider: "photodna.cloud",
          mock: false,
          notes:
            "PhotoDNA skipped — object appears to be video. Image-frame extraction not implemented yet.",
          raw: { skipped: true, reason: "video" },
        };
      }

      const signed = await getInternalDownloadUrl(normalized.key, 60 * 5);
      return await matchUrl(creds, signed.url);
    }

    // Default: binary — download from R2 (or use provided buffer)
    const { buffer, contentType, key } = await resolveImageBuffer(normalized);

    if (key && isLikelyVideoKey(key, contentType)) {
      console.info(`${LOG} skipping video object`, { key, contentType });
      return {
        match: false,
        confidence: 0,
        provider: "photodna.cloud",
        mock: false,
        notes:
          "PhotoDNA skipped — object appears to be video. Image-frame extraction not implemented yet.",
        raw: { skipped: true, reason: "video", contentType },
      };
    }

    if (!isLikelyImageBuffer(buffer, contentType)) {
      console.warn(`${LOG} buffer does not look like a supported image`, {
        key,
        contentType,
        bytes: buffer.byteLength,
      });
      // Still attempt Match — some formats may not have clear magic bytes.
    }

    return await matchBinary(creds, buffer);
  } catch (error) {
    if (error instanceof PhotoDnaError) {
      console.error(`${LOG} failed`, { step: error.step, message: error.message });
      throw error;
    }
    console.error(`${LOG} unexpected failure`, { error });
    throw new PhotoDnaError(
      "match",
      error instanceof Error ? error.message : "PhotoDNA match failed.",
      error,
    );
  }
}
