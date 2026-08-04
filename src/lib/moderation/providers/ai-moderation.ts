/**
 * AI content moderation providers (pluggable).
 *
 * Switch with `AI_MODERATION_PROVIDER`:
 *   - `rekognition`  — AWS Rekognition DetectModerationLabels (default when enabled)
 *   - `google_vision` — Google Cloud Vision SafeSearchDetection (REST)
 *   - `hive`         — Hive Moderation API (REST)
 *   - `mock`         — local deterministic scores (also the fallback)
 *
 * Enable live calls with `AI_MODERATION_ENABLED=true` plus the provider’s keys.
 * When disabled / incomplete, falls back to mock (honors MODERATION_MOCK_SCENARIO).
 *
 * IMPORTANT
 * ---------
 * PhotoDNA remains the primary known-CSAM hash check. Most general vision APIs
 * do **not** replace PhotoDNA. AI scores here catch adult/sexual content,
 * violence, and (when a vendor exposes them) underage-related risk signals.
 * Never log image bytes.
 */

import {
  DetectModerationLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { z } from "zod";
import {
  getModerationMockScenario,
  type ModerationMockScenario,
} from "@/lib/moderation/mock-scenario";
import type { ModerationLabels } from "@/lib/moderation/types";
import { getObjectBytes } from "@/lib/r2";

const LOG = "[moderation.ai]";

export const AI_MODERATION_PROVIDERS = [
  "rekognition",
  "google_vision",
  "hive",
  "mock",
] as const;

export type AiModerationProviderName =
  (typeof AI_MODERATION_PROVIDERS)[number];

export type AiModerationInput =
  | { buffer: Buffer; contentType?: string; key?: string }
  | { key: string; buffer?: undefined; contentType?: string };

export type AiSafetyLabel = {
  name: string;
  /** Confidence / score in [0, 1] when available */
  score: number;
  parent?: string;
};

export type AiModerationProviderResult = {
  /** Aggregate sexual / nudity risk in [0, 1] */
  nudityScore: number;
  /**
   * Aggregate CSAM / underage risk in [0, 1] when the vendor exposes a signal.
   * Often 0 for Rekognition / SafeSearch — rely on PhotoDNA for known CSAM.
   */
  csamScore: number;
  /** Violence / graphic content in [0, 1] */
  violenceScore: number;
  /** Other policy-relevant category scores */
  categories: Record<string, number>;
  labels: string[];
  detailedLabels: AiSafetyLabel[];
  provider: string;
  mock: boolean;
  notes?: string;
  /** Sanitized vendor payload (no bytes) */
  raw?: Record<string, unknown>;
};

export class AiModerationError extends Error {
  readonly step: string;
  readonly cause?: unknown;

  constructor(step: string, message: string, cause?: unknown) {
    super(`[AI-Moderation:${step}] ${message}`);
    this.name = "AiModerationError";
    this.step = step;
    this.cause = cause;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function maxScore(scores: number[]): number {
  return scores.length ? Math.max(...scores.map(clamp01)) : 0;
}

export function resolveAiProviderName(): AiModerationProviderName {
  const raw = process.env.AI_MODERATION_PROVIDER?.trim().toLowerCase();
  if (raw && (AI_MODERATION_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as AiModerationProviderName;
  }
  return "rekognition";
}

/**
 * Live AI moderation is used when enabled and the selected provider has credentials.
 */
export function isAiModerationEnabled(): boolean {
  if (process.env.AI_MODERATION_ENABLED !== "true") return false;
  const provider = resolveAiProviderName();
  if (provider === "mock") return false;

  switch (provider) {
    case "rekognition":
      return Boolean(
        process.env.AWS_ACCESS_KEY_ID?.trim() ||
          process.env.REKOGNITION_ACCESS_KEY_ID?.trim() ||
          process.env.AWS_PROFILE?.trim(),
      );
    case "google_vision":
      return Boolean(process.env.GOOGLE_VISION_API_KEY?.trim());
    case "hive":
      return Boolean(process.env.HIVE_API_KEY?.trim());
    default:
      return false;
  }
}

async function resolveImageBuffer(
  input: AiModerationInput,
): Promise<{ buffer: Buffer; contentType?: string; key?: string }> {
  if ("buffer" in input && input.buffer) {
    return {
      buffer: input.buffer,
      contentType: input.contentType,
      key: input.key,
    };
  }
  if ("key" in input && input.key) {
    const object = await getObjectBytes(input.key);
    return {
      buffer: object.body,
      contentType: object.contentType ?? input.contentType,
      key: object.key,
    };
  }
  throw new AiModerationError(
    "resolveInput",
    "AI moderation requires an image buffer or R2 object key.",
  );
}

function isLikelyVideo(key?: string, contentType?: string): boolean {
  if (contentType?.toLowerCase().startsWith("video/")) return true;
  if (!key) return false;
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(key);
}

function toModerationLabels(
  result: AiModerationProviderResult,
): ModerationLabels {
  return {
    labels: result.labels,
    categories: {
      ...result.categories,
      nudity: result.nudityScore,
      csam: result.csamScore,
      violence: result.violenceScore,
    },
    provider: result.provider,
    raw: {
      detailedLabels: result.detailedLabels,
      mock: result.mock,
      ...(result.raw ?? {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Mock                                                                       */
/* -------------------------------------------------------------------------- */

export function moderateWithAiMock(keyOrHint?: string): AiModerationProviderResult {
  const scenario = getModerationMockScenario();

  const byScenario: Record<ModerationMockScenario, AiModerationProviderResult> =
    {
      csam: {
        nudityScore: 0.4,
        csamScore: 0.97,
        violenceScore: 0.05,
        categories: { csam: 0.97, nudity: 0.4 },
        labels: ["mock_csam"],
        detailedLabels: [{ name: "mock_csam", score: 0.97 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes: "MOCK: High CSAM score (MODERATION_MOCK_SCENARIO=csam).",
        raw: { scenario, key: keyOrHint ?? null },
      },
      adult: {
        nudityScore: 0.88,
        csamScore: 0.02,
        violenceScore: 0.05,
        categories: { csam: 0.02, nudity: 0.88 },
        labels: ["mock_adult"],
        detailedLabels: [{ name: "mock_adult", score: 0.88 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes: "MOCK: High nudity score (MODERATION_MOCK_SCENARIO=adult).",
        raw: { scenario, key: keyOrHint ?? null },
      },
      rejected: {
        nudityScore: 0.98,
        csamScore: 0.01,
        violenceScore: 0.1,
        categories: { csam: 0.01, nudity: 0.98 },
        labels: ["mock_rejected"],
        detailedLabels: [{ name: "mock_rejected", score: 0.98 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes: "MOCK: Extreme nudity (MODERATION_MOCK_SCENARIO=rejected).",
        raw: { scenario, key: keyOrHint ?? null },
      },
      /** Borderline nudity → decision engine → needs_human_review */
      review: {
        nudityScore: 0.5,
        csamScore: 0.02,
        violenceScore: 0.05,
        categories: { csam: 0.02, nudity: 0.5 },
        labels: ["mock_review"],
        detailedLabels: [{ name: "mock_review", score: 0.5 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes:
          "MOCK: Borderline nudity (MODERATION_MOCK_SCENARIO=review) → needs_human_review.",
        raw: { scenario, key: keyOrHint ?? null },
      },
      violence: {
        nudityScore: 0.05,
        csamScore: 0.01,
        violenceScore: 0.95,
        categories: { violence: 0.95 },
        labels: ["mock_violence"],
        detailedLabels: [{ name: "mock_violence", score: 0.95 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes: "MOCK: High violence (MODERATION_MOCK_SCENARIO=violence).",
        raw: { scenario, key: keyOrHint ?? null },
      },
      violence_review: {
        nudityScore: 0.05,
        csamScore: 0.01,
        violenceScore: 0.65,
        categories: { violence: 0.65 },
        labels: ["mock_violence_review"],
        detailedLabels: [{ name: "mock_violence_review", score: 0.65 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes:
          "MOCK: Borderline violence (MODERATION_MOCK_SCENARIO=violence_review) → needs_human_review.",
        raw: { scenario, key: keyOrHint ?? null },
      },
      clean: {
        nudityScore: 0.02,
        csamScore: 0.01,
        violenceScore: 0.01,
        categories: { csam: 0.01, nudity: 0.02 },
        labels: ["mock_clean"],
        detailedLabels: [{ name: "mock_clean", score: 0.02 }],
        provider: "ai.moderation.mock",
        mock: true,
        notes: "MOCK: Clean scores.",
        raw: { scenario: "clean", key: keyOrHint ?? null },
      },
    };

  const result = byScenario[scenario];
  console.info(`${LOG} mock result`, {
    scenario,
    nudityScore: result.nudityScore,
    csamScore: result.csamScore,
    violenceScore: result.violenceScore,
    key: keyOrHint ?? null,
  });
  return result;
}

/* -------------------------------------------------------------------------- */
/* AWS Rekognition                                                            */
/* -------------------------------------------------------------------------- */

const NUDITY_LABEL_HINTS = [
  "nudity",
  "explicit nudity",
  "graphic male nudity",
  "graphic female nudity",
  "sexual activity",
  "illustrated explicit nudity",
  "adult toys",
  "partial nudity",
  "suggestive",
  "female swimwear or underwear",
  "male swimwear or underwear",
  "barechested male",
  "revealing clothes",
  "sexual situations",
];

const VIOLENCE_LABEL_HINTS = [
  "violence",
  "graphic violence",
  "weapon",
  "weapons",
  "blood",
  "gore",
  "self injury",
];

/** Rekognition does not ship a dedicated CSAM taxonomy — keep this list conservative. */
const UNDERAGE_LABEL_HINTS = [
  "illustrated explicit nudity of a minor",
  "explicit nudity of a minor",
];

function scoreFromRekognitionLabels(
  labels: Array<{ Name?: string; ParentName?: string; Confidence?: number }>,
): AiModerationProviderResult {
  const detailed: AiSafetyLabel[] = labels
    .filter((l) => l.Name)
    .map((l) => ({
      name: l.Name!,
      parent: l.ParentName,
      score: clamp01((l.Confidence ?? 0) / 100),
    }));

  const nudityScores: number[] = [];
  const violenceScores: number[] = [];
  const csamScores: number[] = [];
  const categories: Record<string, number> = {};

  for (const label of detailed) {
    const name = label.name.toLowerCase();
    categories[label.name] = label.score;

    if (NUDITY_LABEL_HINTS.some((h) => name.includes(h) || h.includes(name))) {
      nudityScores.push(label.score);
    }
    if (VIOLENCE_LABEL_HINTS.some((h) => name.includes(h))) {
      violenceScores.push(label.score);
    }
    if (UNDERAGE_LABEL_HINTS.some((h) => name.includes(h))) {
      csamScores.push(label.score);
    }
  }

  return {
    nudityScore: maxScore(nudityScores),
    csamScore: maxScore(csamScores),
    violenceScore: maxScore(violenceScores),
    categories,
    labels: detailed.map((d) => d.name),
    detailedLabels: detailed,
    provider: "aws.rekognition",
    mock: false,
    notes:
      csamScores.length > 0
        ? "Rekognition returned underage-related moderation labels — escalate with PhotoDNA / policy."
        : "Rekognition DetectModerationLabels complete. Known-CSAM hash matching still relies on PhotoDNA.",
    raw: {
      labelCount: detailed.length,
      // Truncate for audit size
      labels: detailed.slice(0, 40),
    },
  };
}

async function moderateWithRekognition(
  buffer: Buffer,
): Promise<AiModerationProviderResult> {
  const region =
    process.env.REKOGNITION_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    "us-east-1";

  const accessKeyId =
    process.env.REKOGNITION_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.REKOGNITION_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();

  const client = new RekognitionClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        }
      : {}),
  });

  const minConfidence = Number(
    process.env.REKOGNITION_MIN_CONFIDENCE ?? 50,
  );

  console.info(`${LOG} Rekognition DetectModerationLabels starting`, {
    region,
    bytes: buffer.byteLength,
    minConfidence,
  });

  try {
    const response = await client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: buffer },
        MinConfidence: Number.isFinite(minConfidence) ? minConfidence : 50,
      }),
    );

    const result = scoreFromRekognitionLabels(response.ModerationLabels ?? []);
    console.info(`${LOG} Rekognition complete`, {
      nudityScore: result.nudityScore,
      csamScore: result.csamScore,
      violenceScore: result.violenceScore,
      labelCount: result.labels.length,
    });
    return result;
  } catch (error) {
    console.error(`${LOG} Rekognition failed`, { error });
    throw new AiModerationError(
      "rekognition",
      error instanceof Error
        ? error.message
        : "AWS Rekognition DetectModerationLabels failed.",
      error,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Google Cloud Vision SafeSearch                                             */
/* -------------------------------------------------------------------------- */

const GOOGLE_LIKELIHOOD_SCORE: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0.05,
  UNLIKELY: 0.2,
  POSSIBLE: 0.5,
  LIKELY: 0.75,
  VERY_LIKELY: 0.95,
};

function likelihoodScore(value: unknown): number {
  if (typeof value !== "string") return 0;
  return GOOGLE_LIKELIHOOD_SCORE[value.toUpperCase()] ?? 0;
}

async function moderateWithGoogleVision(
  buffer: Buffer,
): Promise<AiModerationProviderResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!apiKey) {
    throw new AiModerationError(
      "google_vision",
      "GOOGLE_VISION_API_KEY is required for AI_MODERATION_PROVIDER=google_vision.",
    );
  }

  const endpoint =
    process.env.GOOGLE_VISION_API_URL?.trim() ||
    "https://vision.googleapis.com/v1/images:annotate";

  console.info(`${LOG} Google SafeSearch starting`, {
    bytes: buffer.byteLength,
  });

  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: buffer.toString("base64") },
          features: [{ type: "SAFE_SEARCH_DETECTION" }],
        },
      ],
    }),
  });

  const json = (await response.json()) as {
    responses?: Array<{
      safeSearchAnnotation?: Record<string, string>;
      error?: { message?: string };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    console.error(`${LOG} Google Vision HTTP error`, {
      status: response.status,
      message: json.error?.message,
    });
    throw new AiModerationError(
      "google_vision",
      `Google Vision failed with HTTP ${response.status}: ${json.error?.message ?? "unknown"}`,
    );
  }

  const annotation = json.responses?.[0]?.safeSearchAnnotation;
  const firstError = json.responses?.[0]?.error;
  if (firstError?.message) {
    throw new AiModerationError("google_vision", firstError.message);
  }
  if (!annotation) {
    throw new AiModerationError(
      "google_vision",
      "Google Vision response missing safeSearchAnnotation.",
    );
  }

  const adult = likelihoodScore(annotation.adult);
  const racy = likelihoodScore(annotation.racy);
  const violence = likelihoodScore(annotation.violence);
  const medical = likelihoodScore(annotation.medical);
  const spoof = likelihoodScore(annotation.spoof);

  const nudityScore = maxScore([adult, racy]);
  // SafeSearch has no CSAM class — leave at 0; PhotoDNA covers known hashes.
  const csamScore = 0;

  const detailedLabels: AiSafetyLabel[] = (
    [
      ["adult", adult],
      ["racy", racy],
      ["violence", violence],
      ["medical", medical],
      ["spoof", spoof],
    ] as const
  ).map(([name, score]) => ({ name, score }));

  const result: AiModerationProviderResult = {
    nudityScore,
    csamScore,
    violenceScore: violence,
    categories: { adult, racy, violence, medical, spoof, nudity: nudityScore },
    labels: detailedLabels.filter((l) => l.score >= 0.5).map((l) => l.name),
    detailedLabels,
    provider: "google.vision.safesearch",
    mock: false,
    notes:
      "Google SafeSearch complete. No dedicated CSAM class — rely on PhotoDNA for known CSAM hashes.",
    raw: { safeSearchAnnotation: annotation },
  };

  console.info(`${LOG} Google SafeSearch complete`, {
    nudityScore: result.nudityScore,
    violenceScore: result.violenceScore,
  });

  return result;
}

/* -------------------------------------------------------------------------- */
/* Hive                                                                       */
/* -------------------------------------------------------------------------- */

const hiveResponseSchema = z.object({
  status: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();

function scoreHiveClasses(
  classes: Array<{ class?: string; score?: number }>,
): AiModerationProviderResult {
  const detailed: AiSafetyLabel[] = classes
    .filter((c) => c.class && typeof c.score === "number")
    .map((c) => ({
      name: c.class!,
      score: clamp01(c.score!),
    }));

  const categories: Record<string, number> = {};
  const nudityScores: number[] = [];
  const csamScores: number[] = [];
  const violenceScores: number[] = [];

  for (const label of detailed) {
    categories[label.name] = label.score;
    const name = label.name.toLowerCase();

    if (
      name.includes("nudity") ||
      name.includes("nsfw") ||
      name.includes("sexual") ||
      name.includes("yes_sexual") ||
      name.includes("general_nsfw")
    ) {
      nudityScores.push(label.score);
    }
    if (
      name.includes("underage") ||
      name.includes("minor") ||
      name.includes("child") ||
      name.includes("csam") ||
      name.includes("yes_child_present")
    ) {
      // Conservative: only treat strong underage/sexual combo as CSAM-ish signal.
      // Still escalate via policy + PhotoDNA; do not treat presence-of-child alone as CSAM.
      if (
        name.includes("underage") ||
        name.includes("csam") ||
        (name.includes("child") && name.includes("sexual"))
      ) {
        csamScores.push(label.score);
      }
    }
    if (name.includes("violence") || name.includes("gore") || name.includes("weapon")) {
      violenceScores.push(label.score);
    }
  }

  return {
    nudityScore: maxScore(nudityScores),
    csamScore: maxScore(csamScores),
    violenceScore: maxScore(violenceScores),
    categories,
    labels: detailed.filter((d) => d.score >= 0.5).map((d) => d.name),
    detailedLabels: detailed,
    provider: "hive.moderation",
    mock: false,
    notes:
      "Hive moderation complete. Treat underage-related classes as escalation signals alongside PhotoDNA.",
    raw: { classCount: detailed.length, top: detailed.slice(0, 40) },
  };
}

async function moderateWithHive(
  buffer: Buffer,
  contentType?: string,
): Promise<AiModerationProviderResult> {
  const apiKey = process.env.HIVE_API_KEY?.trim();
  if (!apiKey) {
    throw new AiModerationError(
      "hive",
      "HIVE_API_KEY is required for AI_MODERATION_PROVIDER=hive.",
    );
  }

  const endpoint =
    process.env.HIVE_API_URL?.trim() ||
    "https://api.thehive.ai/api/v2/task/sync";

  console.info(`${LOG} Hive moderation starting`, {
    bytes: buffer.byteLength,
    contentType: contentType ?? "application/octet-stream",
  });

  const form = new FormData();
  form.set(
    "media",
    new Blob([new Uint8Array(buffer)], {
      type: contentType || "application/octet-stream",
    }),
    "media.bin",
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
    },
    body: form,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new AiModerationError(
      "hive",
      `Hive returned non-JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok) {
    console.error(`${LOG} Hive HTTP error`, { status: response.status });
    throw new AiModerationError(
      "hive",
      `Hive moderation failed with HTTP ${response.status}.`,
    );
  }

  const parsed = hiveResponseSchema.safeParse(json);
  const statusRows = parsed.success ? parsed.data.status ?? [] : [];

  // Hive sync responses nest classes under status[].response.output[].classes
  const classes: Array<{ class?: string; score?: number }> = [];
  for (const row of statusRows) {
    const responseBlock = row.response as
      | { output?: Array<{ classes?: Array<{ class?: string; score?: number }> }> }
      | undefined;
    for (const out of responseBlock?.output ?? []) {
      for (const cls of out.classes ?? []) {
        classes.push(cls);
      }
    }
  }

  // Fallback: some Hive models return flat classifications
  if (classes.length === 0 && json && typeof json === "object") {
    const maybe = json as { classifications?: Array<{ class?: string; score?: number }> };
    if (Array.isArray(maybe.classifications)) {
      classes.push(...maybe.classifications);
    }
  }

  const result = scoreHiveClasses(classes);
  console.info(`${LOG} Hive complete`, {
    nudityScore: result.nudityScore,
    csamScore: result.csamScore,
    violenceScore: result.violenceScore,
    labelCount: result.labels.length,
  });
  return result;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run AI content moderation with the configured provider.
 * Accepts an image buffer or R2 key. Falls back to mock when disabled.
 */
export async function moderateWithAi(
  input: AiModerationInput | string,
): Promise<AiModerationProviderResult> {
  const normalized: AiModerationInput =
    typeof input === "string" ? { key: input } : input;

  const provider = resolveAiProviderName();

  if (!isAiModerationEnabled() || provider === "mock") {
    const hint =
      "key" in normalized && normalized.key
        ? normalized.key
        : "buffer" in normalized
          ? "buffer"
          : undefined;
    return moderateWithAiMock(hint);
  }

  try {
    const { buffer, contentType, key } = await resolveImageBuffer(normalized);

    if (isLikelyVideo(key, contentType)) {
      console.info(`${LOG} skipping video for still-image AI providers`, {
        key,
        contentType,
        provider,
      });
      return {
        nudityScore: 0,
        csamScore: 0,
        violenceScore: 0,
        categories: {},
        labels: [],
        detailedLabels: [],
        provider: `ai.${provider}.skipped_video`,
        mock: false,
        notes:
          "AI still-image moderation skipped for video. Add async video moderation later if needed.",
        raw: { skipped: true, reason: "video", provider },
      };
    }

    console.info(`${LOG} running provider`, {
      provider,
      key: key ?? null,
      bytes: buffer.byteLength,
    });

    switch (provider) {
      case "rekognition":
        return await moderateWithRekognition(buffer);
      case "google_vision":
        return await moderateWithGoogleVision(buffer);
      case "hive":
        return await moderateWithHive(buffer, contentType);
      default:
        return moderateWithAiMock(key);
    }
  } catch (error) {
    if (error instanceof AiModerationError) throw error;
    console.error(`${LOG} unexpected failure`, { provider, error });
    throw new AiModerationError(
      "moderate",
      error instanceof Error ? error.message : "AI moderation failed.",
      error,
    );
  }
}

/** Map provider result into the pipeline’s ModerationLabels shape. */
export function aiResultToModerationLabels(
  result: AiModerationProviderResult,
): ModerationLabels {
  return toModerationLabels(result);
}
