import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { ModerationStatus } from "@/lib/moderation/types";

/**
 * Cloudflare R2 helpers (S3-compatible).
 *
 * SAFETY RULES
 * ------------
 * 1. All client uploads MUST land under `temp/` first. Never accept direct
 *    writes into `originals/`, `processed/`, or public-facing prefixes.
 * 2. Never generate long-lived or public (unsigned) media URLs. Prefer short
 *    presigned GET/PUT URLs only.
 * 3. Content must NOT be served to end users until moderation_status = "clean"
 *    (and media lifecycle status is ready). Use getDownloadUrl() which enforces
 *    the clean check.
 * 4. Suspected CSAM / policy violations must be moved into `quarantine/` via
 *    quarantineObject() and never served again through app download helpers.
 * 5. Quarantined objects must remain inaccessible: no signed URLs (user or
 *    internal), no automatic deletion, and no move out of quarantine/.
 *    Relocating temp/originals → quarantine/ uses copy+delete of the *source*
 *    key only — the evidence is preserved under quarantine/.
 */

/* -------------------------------------------------------------------------- */
/* Prefixes & limits                                                          */
/* -------------------------------------------------------------------------- */

export const R2_PREFIXES = {
  temp: "temp/",
  originals: "originals/",
  processed: "processed/",
  thumbnails: "thumbnails/",
  /** Generated memory movies (final MP4 + posters). */
  movies: "movies/",
  quarantine: "quarantine/",
  /**
   * Owner-only Private Documents (never family-shared gallery media).
   * Permanent: private-documents/{userId}/{documentId}/…
   * Staging:   private-documents-temp/{userId}/…
   */
  privateDocuments: "private-documents/",
  privateDocumentsTemp: "private-documents-temp/",
  /**
   * Owner-only Digital Legacy videos (never family gallery / Memories / Movies).
   * Permanent: private-legacy-videos/{userId}/{videoId}/…
   * Staging:   private-legacy-videos-temp/{userId}/…
   */
  privateLegacyVideos: "private-legacy-videos/",
  privateLegacyVideosTemp: "private-legacy-videos-temp/",
} as const;

export type R2Prefix = (typeof R2_PREFIXES)[keyof typeof R2_PREFIXES];

/** Hard cap — never issue longer-lived signed URLs than this. */
export const MAX_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour

export const DEFAULT_UPLOAD_EXPIRES_IN_SECONDS = 60 * 10; // 10 minutes
export const DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS = 60 * 5; // 5 minutes

/* -------------------------------------------------------------------------- */
/* Environment validation                                                     */
/* -------------------------------------------------------------------------- */

const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url().optional(),
  R2_REGION: z.string().min(1).default("auto"),
});

export type R2Env = z.infer<typeof r2EnvSchema>;

function resolveEndpoint(env: R2Env): string {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT;
  if (env.R2_ACCOUNT_ID) {
    return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  throw new Error(
    "R2_ENDPOINT or R2_ACCOUNT_ID is required. Copy .env.example to .env.local and configure R2.",
  );
}

function loadR2Env(): R2Env & { endpoint: string } {
  const parsed = r2EnvSchema.safeParse({
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_REGION: process.env.R2_REGION ?? "auto",
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid R2 environment configuration: ${details}. Copy .env.example to .env.local.`,
    );
  }

  return {
    ...parsed.data,
    endpoint: resolveEndpoint(parsed.data),
  };
}

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

let _client: S3Client | null = null;
let _bucket: string | null = null;

export function getR2Client(): S3Client {
  if (!_client) {
    const env = loadR2Env();
    _client = new S3Client({
      region: env.R2_REGION,
      endpoint: env.endpoint,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      // R2 is path-style compatible; forcePathStyle avoids virtual-host quirks.
      forcePathStyle: true,
    });
    _bucket = env.R2_BUCKET_NAME;
  }
  return _client;
}

export function getR2Bucket(): string {
  if (!_bucket) {
    _bucket = loadR2Env().R2_BUCKET_NAME;
  }
  return _bucket;
}

/** Reset cached client (useful in tests). */
export function resetR2Client(): void {
  _client = null;
  _bucket = null;
}

/* -------------------------------------------------------------------------- */
/* Key helpers                                                                */
/* -------------------------------------------------------------------------- */

export type BuildObjectKeyInput = {
  userId: string;
  mediaId: string;
  filename: string;
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "bin";
  const parts = base.split(".");
  if (parts.length < 2) return "bin";
  const ext = parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

/**
 * Forced upload key pattern:
 * temp/{userId}/{year}/{month}/{nanoid}.{ext}
 */
export function buildTempUploadKey(userId: string, filename: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = nanoid();
  const ext = extensionFromFilename(filename);
  return `${R2_PREFIXES.temp}${userId}/${year}/${month}/${id}.${ext}`;
}

export function buildTempObjectKey(input: BuildObjectKeyInput): string {
  return buildTempUploadKey(input.userId, input.filename);
}

export function buildOriginalsObjectKey(input: BuildObjectKeyInput): string {
  return `${R2_PREFIXES.originals}${input.userId}/${input.mediaId}/${sanitizeFilename(input.filename)}`;
}

/** Map a temp/ key to the originals/ prefix (same trailing path). */
export function tempKeyToOriginalsKey(tempKey: string): string {
  if (!tempKey.startsWith(R2_PREFIXES.temp)) {
    throw new Error(`Expected temp/ key, got "${tempKey}"`);
  }
  return tempKey.replace(
    new RegExp(`^${R2_PREFIXES.temp}`),
    R2_PREFIXES.originals,
  );
}

export function buildQuarantineObjectKey(sourceKey: string): string {
  const stripped = sourceKey.replace(
    new RegExp(
      `^(${Object.values(R2_PREFIXES)
        .map((p) => p.replace("/", "\\/"))
        .join("|")})`,
    ),
    "",
  );
  return `${R2_PREFIXES.quarantine}${stripped}`;
}

/**
 * Final rendered movie MP4 key.
 * Shape: movies/{userId}/{movieId}/output.mp4
 */
export function buildMovieOutputKey(userId: string, movieId: string): string {
  if (!userId?.trim() || !movieId?.trim()) {
    throw new Error("buildMovieOutputKey requires userId and movieId.");
  }
  return `${R2_PREFIXES.movies}${userId}/${movieId}/output.mp4`;
}

/**
 * Movie poster / first-frame thumbnail.
 * Shape: movies/{userId}/{movieId}/thumbnail.jpg
 */
export function buildMovieThumbnailKey(userId: string, movieId: string): string {
  if (!userId?.trim() || !movieId?.trim()) {
    throw new Error("buildMovieThumbnailKey requires userId and movieId.");
  }
  return `${R2_PREFIXES.movies}${userId}/${movieId}/thumbnail.jpg`;
}

/** Grid thumbnail under thumbnails/{userId}/{mediaId}.jpg */
export function buildMediaThumbnailKey(userId: string, mediaId: string): string {
  if (!userId?.trim() || !mediaId?.trim()) {
    throw new Error("buildMediaThumbnailKey requires userId and mediaId.");
  }
  return `${R2_PREFIXES.thumbnails}${userId}/${mediaId}.jpg`;
}

/**
 * Large display JPEG for lightbox / slideshow under processed/.
 * Prefer this over the original for photo viewing; fall back to original when missing.
 */
export function buildMediaDisplayKey(userId: string, mediaId: string): string {
  if (!userId?.trim() || !mediaId?.trim()) {
    throw new Error("buildMediaDisplayKey requires userId and mediaId.");
  }
  return `${R2_PREFIXES.processed}${userId}/${mediaId}-display.jpg`;
}

export function isTempKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.temp);
}

export function isOriginalsKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.originals);
}

export function isQuarantineKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.quarantine);
}

/**
 * Keys that may be relocated into quarantine/ (evidence move).
 * Already-quarantined keys are handled as a no-op by quarantineObject().
 */
export function isQuarantinableSourceKey(key: string): boolean {
  return (
    isTempKey(key) ||
    isOriginalsKey(key) ||
    key.startsWith(R2_PREFIXES.processed) ||
    key.startsWith(R2_PREFIXES.thumbnails)
  );
}

function assertTempUploadKey(key: string): void {
  if (!isTempKey(key)) {
    throw new Error(
      `Unsafe upload key "${key}". All uploads must use the "${R2_PREFIXES.temp}" prefix first.`,
    );
  }
}

function assertNotQuarantineKey(key: string): void {
  if (isQuarantineKey(key)) {
    throw new Error(
      `Refusing to serve quarantined object "${key}". Quarantined media is inaccessible by design.`,
    );
  }
}

/** Gallery/media helpers must never touch private document objects. */
export function isPrivateDocumentStorageKey(key: string): boolean {
  return (
    key.startsWith(R2_PREFIXES.privateDocuments) ||
    key.startsWith(R2_PREFIXES.privateDocumentsTemp)
  );
}

/** Gallery/media helpers must never touch Digital Legacy video objects. */
export function isLegacyVideoStorageKey(key: string): boolean {
  return (
    key.startsWith(R2_PREFIXES.privateLegacyVideos) ||
    key.startsWith(R2_PREFIXES.privateLegacyVideosTemp)
  );
}

/** True for any owner-only private vault object prefix. */
export function isPrivateVaultStorageKey(key: string): boolean {
  return isPrivateDocumentStorageKey(key) || isLegacyVideoStorageKey(key);
}

function assertNotPrivateDocumentKey(key: string): void {
  if (isPrivateVaultStorageKey(key)) {
    throw new Error(
      `Refusing to use gallery media helper for private vault key "${key}". Use private document / legacy video storage helpers instead.`,
    );
  }
}

function clampExpiresIn(expiresIn: number): number {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("expiresIn must be a positive number of seconds.");
  }
  return Math.min(Math.floor(expiresIn), MAX_SIGNED_URL_EXPIRES_IN_SECONDS);
}

/* -------------------------------------------------------------------------- */
/* Presigned URLs                                                             */
/* -------------------------------------------------------------------------- */

export type PresignedUrlResult = {
  url: string;
  key: string;
  expiresIn: number;
  /** ISO timestamp when the URL is expected to expire. */
  expiresAt: string;
};

/**
 * Create a short-lived presigned PUT URL.
 * Enforces the temp/ prefix — callers must not upload straight into originals/.
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
): Promise<PresignedUrlResult> {
  assertTempUploadKey(key);

  if (!contentType || !contentType.includes("/")) {
    throw new Error(`Invalid contentType: "${contentType}"`);
  }

  const expires = clampExpiresIn(expiresIn);
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: expires,
  });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

/**
 * Create a short-lived presigned GET URL.
 *
 * IMPORTANT: Content must not be served until moderation_status = "clean".
 * This function refuses to sign downloads unless moderationStatus === "clean".
 * Never use long-lived public bucket URLs for family media.
 */
export async function getDownloadUrl(
  key: string,
  expiresIn: number = DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
  options?: {
    /**
     * Required moderation gate. Must be "clean" to receive a URL.
     * Pass the media row's moderation_status from the database.
     */
    moderationStatus: ModerationStatus;
    /** Optional lifecycle gate — when provided, must be "ready". */
    mediaStatus?: string;
  },
): Promise<PresignedUrlResult> {
  if (!options?.moderationStatus) {
    throw new Error(
      'getDownloadUrl requires options.moderationStatus. Content must not be served until moderation_status = "clean".',
    );
  }

  if (options.moderationStatus !== "clean") {
    throw new Error(
      `Refusing to generate download URL for key "${key}" with moderation_status="${options.moderationStatus}". Only "clean" media may be served.`,
    );
  }

  if (options.mediaStatus && options.mediaStatus !== "ready") {
    throw new Error(
      `Refusing to generate download URL for key "${key}" with status="${options.mediaStatus}". Only ready media may be served.`,
    );
  }

  assertNotQuarantineKey(key);
  assertNotPrivateDocumentKey(key);

  const expires = clampExpiresIn(expiresIn);
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    // Encourage browser caching of gallery thumbs for the signed URL lifetime.
    ResponseCacheControl: `private, max-age=${expires}`,
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: expires,
  });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

/**
 * Internal/worker-only download URL (e.g. moderation scanners).
 * Does NOT enforce the clean gate — do not expose to end users.
 *
 * Still refuses quarantine/ keys: quarantined evidence must not be reachable
 * via any signed URL from this helper module.
 */
export async function getInternalDownloadUrl(
  key: string,
  expiresIn: number = DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
): Promise<PresignedUrlResult> {
  assertNotQuarantineKey(key);
  assertNotPrivateDocumentKey(key);

  const expires = clampExpiresIn(expiresIn);
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: expires,
  });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

/**
 * Short-lived signed GET for a generated movie object.
 *
 * SAFETY:
 * - Only signs keys under movies/{userId}/{movieId}/
 * - Never signs quarantine/
 * - Default TTL up to 1 hour (MAX_SIGNED_URL_EXPIRES_IN_SECONDS)
 *
 * Do not use getInternalDownloadUrl for end-user movie playback — that helper
 * is for workers/scanners and does not enforce the movies/ ownership prefix.
 */
export async function getMovieDownloadUrl(
  key: string,
  userId: string,
  movieId: string,
  expiresIn: number = DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
): Promise<PresignedUrlResult> {
  assertMovieObjectKey(key, userId, movieId);
  assertNotPrivateDocumentKey(key);

  // Align with MAX_SIGNED_URL_EXPIRES_IN_SECONDS so pause/seek mid-watch
  // does not hit ExpiredRequest on range requests.
  const expires = clampExpiresIn(expiresIn);
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: expires,
  });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

function assertMovieObjectKey(
  key: string,
  userId: string,
  movieId: string,
): void {
  if (!key?.trim() || !userId?.trim() || !movieId?.trim()) {
    throw new Error("getMovieDownloadUrl requires key, userId, and movieId.");
  }
  assertNotQuarantineKey(key);
  const expectedPrefix = `${R2_PREFIXES.movies}${userId}/${movieId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(
      `Refusing to sign movie URL for key "${key}". Expected prefix "${expectedPrefix}".`,
    );
  }
}

/**
 * Download object bytes for worker-side scanners (e.g. PhotoDNA).
 * Prefer this over signed URLs when the vendor cannot fetch private R2 directly.
 * Refuses quarantine/ keys.
 */
export async function getObjectBytes(key: string): Promise<{
  key: string;
  body: Buffer;
  contentType?: string;
  contentLength?: number;
}> {
  if (!key?.trim()) {
    throw new Error("getObjectBytes requires a key.");
  }
  assertNotQuarantineKey(key);

  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`R2 object has empty body: ${key}`);
  }

  const bytes = await response.Body.transformToByteArray();
  return {
    key,
    body: Buffer.from(bytes),
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/**
 * Server-side PutObject into temp/ for same-origin proxy uploads.
 * Used when browser → R2 CORS blocks direct PUT (common on LAN / iPhone).
 * Key must already be a valid temp/{userId}/… upload key.
 */
export async function putTempObjectBytes(
  key: string,
  body: Buffer | Uint8Array,
  options?: {
    contentType?: string;
  },
): Promise<{ key: string; byteSize: number }> {
  if (!key?.trim()) {
    throw new Error("putTempObjectBytes requires a key.");
  }
  assertTempUploadKey(key);

  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: bytes,
      ContentType: options?.contentType ?? "application/octet-stream",
      CacheControl: "private, no-store",
    }),
  );

  return { key, byteSize: bytes.byteLength };
}

/**
 * Server-side PutObject for worker outputs (processed media, movie exports).
 * Refuses quarantine/ and temp/ — temp uploads must use getUploadUrl or putTempObjectBytes.
 */
export async function putObjectBytes(
  key: string,
  body: Buffer | Uint8Array,
  options?: {
    contentType?: string;
    cacheControl?: string;
  },
): Promise<{ key: string; byteSize: number }> {
  if (!key?.trim()) {
    throw new Error("putObjectBytes requires a key.");
  }
  assertNotQuarantineKey(key);
  if (isTempKey(key)) {
    throw new Error(
      `Refusing putObjectBytes into temp/ ("${key}"). Use getUploadUrl for client uploads.`,
    );
  }
  if (key.startsWith(R2_PREFIXES.privateDocumentsTemp)) {
    throw new Error(
      `Refusing putObjectBytes into private-documents-temp/ ("${key}"). Use createPrivateDocumentUploadUrl for client uploads.`,
    );
  }
  if (key.startsWith(R2_PREFIXES.privateLegacyVideosTemp)) {
    throw new Error(
      `Refusing putObjectBytes into private-legacy-videos-temp/ ("${key}"). Use legacy video upload helpers for client uploads.`,
    );
  }

  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: bytes,
      ContentType: options?.contentType ?? "application/octet-stream",
      CacheControl: options?.cacheControl ?? "private, max-age=31536000",
    }),
  );

  return { key, byteSize: bytes.byteLength };
}

/* -------------------------------------------------------------------------- */
/* Object operations                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Delete an R2 object.
 *
 * SAFETY: Never deletes objects under quarantine/ — evidence must be preserved
 * for authorized review / legal process. Use a separate, audited procedure
 * outside this helper if counsel ever authorizes destruction.
 */
export async function deleteObject(key: string): Promise<void> {
  if (isQuarantineKey(key)) {
    throw new Error(
      `Refusing to delete quarantined object "${key}". Evidence must be preserved; never delete quarantine/ automatically.`,
    );
  }

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
  );
}

export type HeadObjectMeta = {
  key: string;
  contentLength: number;
  contentType?: string;
};

/**
 * HEAD an object for size/type checks (e.g. finalize upload against real bytes).
 * Returns null when the object does not exist.
 */
export async function headObjectMeta(
  key: string,
): Promise<HeadObjectMeta | null> {
  if (!key?.trim()) {
    throw new Error("headObjectMeta requires a key.");
  }

  try {
    const response = await getR2Client().send(
      new HeadObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
      }),
    );
    const contentLength = Number(response.ContentLength ?? 0);
    return {
      key,
      contentLength: Number.isFinite(contentLength)
        ? Math.max(0, contentLength)
        : 0,
      contentType: response.ContentType,
    };
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === "number"
        ? (error as { $metadata: { httpStatusCode: number } }).$metadata
            .httpStatusCode
        : undefined;

    if (status === 404) return null;
    throw error;
  }
}

export async function objectExists(key: string): Promise<boolean> {
  const meta = await headObjectMeta(key);
  return meta != null;
}

export type MoveObjectResult = {
  fromKey: string;
  toKey: string;
};

/**
 * Server-side move (copy + delete source). Used to promote temp/ → originals/
 * or to relocate objects into quarantine/.
 *
 * Does not remove evidence: when relocating into quarantine/, the object
 * continues to exist at `toKey`. Source deletion only removes the old key.
 * Moving *out of* quarantine/ is refused.
 */
export async function moveObject(
  fromKey: string,
  toKey: string,
): Promise<MoveObjectResult> {
  if (!fromKey || !toKey) {
    throw new Error("moveObject requires both fromKey and toKey.");
  }
  if (fromKey === toKey) {
    return { fromKey, toKey };
  }

  if (isQuarantineKey(fromKey) && !isQuarantineKey(toKey)) {
    throw new Error(
      `Refusing to move "${fromKey}" out of quarantine/. Evidence must remain under quarantine/.`,
    );
  }

  if (isQuarantineKey(fromKey) && isQuarantineKey(toKey)) {
    throw new Error(
      `Refusing to relocate within quarantine/ ("${fromKey}" → "${toKey}"). Use an audited process if re-keying is required.`,
    );
  }

  const bucket = getR2Bucket();
  const client = getR2Client();

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      // CopySource must be "bucket/key" with path segments encoded.
      CopySource: `${bucket}/${fromKey
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`,
      Key: toKey,
    }),
  );

  // Delete only the non-quarantine source key after a successful copy.
  // Quarantine destinations are never passed to deleteObject().
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: fromKey,
    }),
  );

  return { fromKey, toKey };
}

/**
 * Promote a temp upload into the originals/ prefix after the DB row is created.
 * Does not imply the object is safe to serve — moderation must still pass.
 */
export async function promoteTempToOriginals(
  tempKey: string,
  originalsKey?: string,
): Promise<MoveObjectResult> {
  assertTempUploadKey(tempKey);

  const toKey = originalsKey ?? tempKeyToOriginalsKey(tempKey);

  if (!toKey.startsWith(R2_PREFIXES.originals)) {
    throw new Error(
      `promoteTempToOriginals destination must use "${R2_PREFIXES.originals}" prefix.`,
    );
  }

  return moveObject(tempKey, toKey);
}

/**
 * Quarantine an object: relocate temp/ or originals/ (also processed/
 * thumbnails/) under quarantine/ so no signed URL helper will serve it.
 *
 * After this, update the media row (moderation_status, quarantined_at) via
 * `quarantineMedia` — never call getDownloadUrl() / getInternalDownloadUrl()
 * for the quarantine key.
 *
 * Evidence is preserved at the quarantine/ destination. The source key is
 * removed only as part of the move (copy + delete source).
 */
export async function quarantineObject(
  sourceKey: string,
): Promise<MoveObjectResult> {
  if (!sourceKey?.trim()) {
    throw new Error("quarantineObject requires a source key.");
  }

  if (isQuarantineKey(sourceKey)) {
    return { fromKey: sourceKey, toKey: sourceKey };
  }

  if (!isQuarantinableSourceKey(sourceKey)) {
    throw new Error(
      `Refusing to quarantine "${sourceKey}". Source must be under temp/, originals/, processed/, or thumbnails/.`,
    );
  }

  const toKey = buildQuarantineObjectKey(sourceKey);
  return moveObject(sourceKey, toKey);
}

/* -------------------------------------------------------------------------- */
/* Convenience re-exports matching earlier helper names                       */
/* -------------------------------------------------------------------------- */

/** @deprecated Prefer getUploadUrl */
export async function createUploadPresignedUrl(options: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  return getUploadUrl(
    options.key,
    options.contentType,
    options.expiresInSeconds ?? DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
  );
}

/** @deprecated Prefer getDownloadUrl with moderationStatus: "clean" */
export async function createDownloadPresignedUrl(options: {
  key: string;
  expiresInSeconds?: number;
  moderationStatus: ModerationStatus;
}) {
  return getDownloadUrl(
    options.key,
    options.expiresInSeconds ?? DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
    { moderationStatus: options.moderationStatus },
  );
}
