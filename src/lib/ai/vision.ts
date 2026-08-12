/**
 * Vision analysis — normalize captions/tags/objects/scenes for Ask AI search.
 *
 * Providers (first available wins):
 * 1. OpenAI-compatible vision chat (OPENAI_API_KEY + gpt-4o-mini / AI_VISION_MODEL)
 * 2. AWS Rekognition DetectLabels (existing scene pipeline)
 */

import { z } from "zod";
import { resolveLlmConfig } from "@/lib/ai/llm";
import {
  detectSceneLabelsWithRekognition,
  isRekognitionSceneConfigured,
} from "@/lib/media/scene/rekognition-labels";

export type VisionAnalysisResult = {
  caption: string;
  tags: string[];
  objects: string[];
  scenes: string[];
  description: string;
  /** Optional embedding vector for future semantic search. */
  embedding: number[] | null;
  provider: string;
};

const visionJsonSchema = z.object({
  caption: z.string().default(""),
  tags: z.array(z.string()).default([]),
  objects: z.array(z.string()).default([]),
  scenes: z.array(z.string()).default([]),
  description: z.string().default(""),
});

/** Ultra-generic terms that never help search. */
const INDEX_NOISE = new Set([
  "photo",
  "image",
  "picture",
  "pic",
  "photograph",
  "thing",
  "object",
  "stuff",
  "human",
  "person",
  "people",
  "adult",
]);

/**
 * Demographic / people-category labels — kept for “show me men/women/boys/girls”.
 * These are NOT People-list identities.
 */
export const PEOPLE_CATEGORY_TERMS = new Set([
  "man",
  "men",
  "male",
  "gentleman",
  "gentlemen",
  "guy",
  "guys",
  "woman",
  "women",
  "female",
  "lady",
  "ladies",
  "boy",
  "boys",
  "girl",
  "girls",
  "child",
  "children",
  "kid",
  "kids",
]);

/** Setting / place labels — kept for “indoors”, “beach”, etc. */
export const SETTING_TERMS = new Set([
  "indoor",
  "indoors",
  "inside",
  "interior",
  "outdoor",
  "outdoors",
  "outside",
  "exterior",
  "beach",
  "office",
  "home",
  "party",
  "wedding",
  "playground",
  "park",
]);

/**
 * Map common Rekognition / vendor labels → friendly searchable terms.
 */
const REKOGNITION_LABEL_MAP: Record<string, string[]> = {
  necktie: ["tie", "necktie"],
  "bow tie": ["bow tie", "tie"],
  "tux": ["tuxedo", "suit"],
  "tuxedo": ["tuxedo", "suit", "formalwear"],
  "suit": ["suit", "formalwear"],
  "blazer": ["blazer", "suit", "jacket"],
  "smoking": ["smoking", "cigar", "tobacco"],
  tobacco: ["tobacco", "cigar", "smoking"],
  cigar: ["cigar", "smoking", "tobacco"],
  "indoors": ["indoors", "indoor", "interior"],
  "outdoors": ["outdoors", "outdoor", "exterior"],
  "interior design": ["interior", "indoors", "indoor"],
  beach: ["beach", "shore", "sand", "ocean"],
  "coast": ["beach", "shore", "coast"],
  "ocean": ["ocean", "beach", "water"],
  "man": ["man", "men", "male"],
  "woman": ["woman", "women", "female"],
  "boy": ["boy", "boys", "child"],
  "girl": ["girl", "girls", "child"],
  "child": ["child", "kid", "children"],
  "dress": ["dress"],
  "gown": ["dress", "gown"],
  "cake": ["cake", "dessert"],
  "dog": ["dog", "pet"],
  "automobile": ["car", "vehicle"],
  "car": ["car", "vehicle"],
  "bicycle": ["bicycle", "bike"],
  "bike": ["bicycle", "bike"],
};

export function normalizeVisionToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_/]+/g, " ")
    // Keep letters from any script (playa, 海滩, …) so multilingual queries expand.
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanVisionTerms(
  terms: string[],
  opts?: { max?: number; channel?: "tags" | "objects" | "scenes" },
): string[] {
  const max = opts?.max ?? 40;
  const channel = opts?.channel ?? "tags";
  const out: string[] = [];

  for (const term of terms) {
    const n = normalizeVisionToken(term);
    if (n.length < 2 || n.length > 48) continue;
    if (INDEX_NOISE.has(n)) continue;

    // People categories belong on objects/tags, not scenes-only noise.
    if (
      PEOPLE_CATEGORY_TERMS.has(n) &&
      channel === "scenes" &&
      !SETTING_TERMS.has(n)
    ) {
      // still allow on scenes if somehow labeled; prefer objects
    }

    if (out.some((t) => t === n)) continue;
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** Expand a vendor label through the Rekognition map. */
export function expandRekognitionLabel(label: string): string[] {
  const n = normalizeVisionToken(label);
  if (!n) return [];
  const mapped = REKOGNITION_LABEL_MAP[n];
  if (mapped) return mapped.map(normalizeVisionToken);
  return [n];
}

export function normalizeVisionResult(
  raw: Partial<VisionAnalysisResult> & { provider: string },
): VisionAnalysisResult {
  const rawObjects = (raw.objects ?? []).flatMap((o) =>
    raw.provider.startsWith("rekognition")
      ? expandRekognitionLabel(o)
      : [o],
  );
  const rawScenes = (raw.scenes ?? []).flatMap((s) =>
    raw.provider.startsWith("rekognition")
      ? expandRekognitionLabel(s)
      : [s],
  );
  const rawTags = (raw.tags ?? []).flatMap((t) =>
    raw.provider.startsWith("rekognition")
      ? expandRekognitionLabel(t)
      : [t],
  );

  const objects = cleanVisionTerms(rawObjects, {
    max: 28,
    channel: "objects",
  });
  const scenes = cleanVisionTerms(rawScenes, { max: 18, channel: "scenes" });
  const tags = cleanVisionTerms(
    [...rawTags, ...objects, ...scenes],
    { max: 48, channel: "tags" },
  );
  const caption = (raw.caption ?? "").trim().slice(0, 240);
  const description = (raw.description ?? caption).trim().slice(0, 800);

  return {
    caption: caption || tags.slice(0, 6).join(", "),
    tags,
    objects,
    scenes,
    description: description || caption || tags.join(", "),
    embedding: raw.embedding ?? null,
    provider: raw.provider,
  };
}

/**
 * Merge per-frame vision results onto one parent video (or multi-image) record.
 * Prefers higher-frequency labels; keeps the richest caption/description.
 */
export function aggregateVisionResults(
  results: VisionAnalysisResult[],
): VisionAnalysisResult {
  if (results.length === 0) {
    return normalizeVisionResult({
      caption: "",
      tags: [],
      objects: [],
      scenes: [],
      description: "",
      embedding: null,
      provider: "none",
    });
  }
  if (results.length === 1) {
    return results[0]!;
  }

  const rank = (lists: string[][]) => {
    const counts = new Map<string, number>();
    for (const list of lists) {
      for (const term of list) {
        const n = normalizeVisionToken(term);
        if (!n) continue;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([term]) => term);
  };

  const caption =
    [...results]
      .map((r) => r.caption.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] ?? "";
  const description =
    [...results]
      .map((r) => r.description.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] ?? caption;

  const providers = [
    ...new Set(results.map((r) => r.provider).filter(Boolean)),
  ];
  const embedding =
    results.find((r) => r.embedding && r.embedding.length > 0)?.embedding ??
    null;

  return normalizeVisionResult({
    caption,
    description,
    tags: rank(results.map((r) => r.tags)),
    objects: rank(results.map((r) => r.objects)),
    scenes: rank(results.map((r) => r.scenes)),
    embedding,
    provider: `video-frames:${providers.join("+")}`,
  });
}

export function isOpenAiVisionConfigured(): boolean {
  return Boolean(resolveLlmConfig());
}

export function isVisionAnalysisConfigured(): boolean {
  return isOpenAiVisionConfigured() || isRekognitionSceneConfigured();
}

/**
 * Analyze image bytes with the best available provider.
 */
export async function analyzeImageVision(
  imageBytes: Buffer,
  options?: { contentType?: string; signal?: AbortSignal },
): Promise<VisionAnalysisResult> {
  if (isOpenAiVisionConfigured()) {
    try {
      return await analyzeWithOpenAiVision(imageBytes, options);
    } catch (err) {
      console.warn("[ai.vision] OpenAI vision failed — trying Rekognition", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (isRekognitionSceneConfigured()) {
    const scene = await detectSceneLabelsWithRekognition(imageBytes);
    const expandedTags = scene.tags.flatMap(expandRekognitionLabel);
    const topLevelScenes = scene.labels
      .filter((l) => (l.parents?.length ?? 0) === 0)
      .flatMap((l) => expandRekognitionLabel(l.name));

    return normalizeVisionResult({
      caption: scene.caption,
      tags: expandedTags,
      objects: expandedTags,
      scenes: topLevelScenes,
      description: scene.caption,
      provider: scene.provider,
    });
  }

  throw new Error(
    "Vision analysis requires OPENAI_API_KEY (or gateway) and/or AWS Rekognition credentials.",
  );
}

async function analyzeWithOpenAiVision(
  imageBytes: Buffer,
  options?: { contentType?: string; signal?: AbortSignal },
): Promise<VisionAnalysisResult> {
  const config = resolveLlmConfig();
  if (!config) {
    throw new Error("OpenAI vision is not configured.");
  }

  const model =
    process.env.AI_VISION_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    "gpt-4o-mini";

  // Keep payload small for chat vision.
  const jpeg = await downscaleForVision(imageBytes);
  const b64 = jpeg.toString("base64");
  const mime = options?.contentType?.startsWith("image/")
    ? options.contentType
    : "image/jpeg";

  const system = `You analyze family photos for a private photo vault search index.
Return ONLY JSON:
{
  "caption": "short factual caption",
  "tags": ["search keywords"],
  "objects": ["specific objects visible"],
  "scenes": ["scene/setting labels"],
  "description": "1-2 sentence description of visual content"
}
Rules:
- Focus on concrete everyday objects people search for: cigar, suit, tie, dress, cake, car, dog, bicycle, bounce house, Christmas tree, etc.
- Include people-category labels when clearly visible: man, woman, boy, girl (never invent personal names).
- Include setting labels when clear: beach, indoors, outdoors, office, party, home, playground, wedding.
- Prefer specific terms; avoid useless generics like photo/image/thing.
- Lowercase tags. Do not invent people's proper names unless printed text is visible in the image.
- Include helpful synonyms when relevant (e.g. suit + tuxedo, tie + necktie, beach + shoreline, cigar + smoking).`;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options?.signal,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this photo for visual search indexing. Emphasize searchable objects, people categories, and settings.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${b64}`,
                detail: "low",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vision API ${res.status}: ${text.slice(0, 300)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision API returned empty content.");

  const parsed = visionJsonSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    throw new Error("Vision API returned invalid JSON shape.");
  }

  return normalizeVisionResult({
    ...parsed.data,
    provider: `openai.vision:${model}`,
  });
}

async function downscaleForVision(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer)
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}
