/**
 * Person Stories — short readable encapsulations from photo/video captions.
 *
 * Only clean/ready media the viewer may see (same as Person photo gallery).
 * Never invents a biography when there are no captions.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { completeChatJson, isLlmConfigured } from "@/lib/ai/llm";
import { getDb } from "@/lib/db";
import { people, type Media } from "@/lib/db/schema";
import { listVisibleMediaLinkedToPerson } from "@/lib/people/person-media";
import { getPersonForUser } from "@/lib/people";
import { listCommentBodiesForMediaIds } from "@/lib/media/comments";
import { isLowSignalMediaComment } from "@/lib/media/comments-shared";

export const PERSON_STORY_GENERATED_BY = ["system", "user"] as const;
export type PersonStoryGeneratedBy = (typeof PERSON_STORY_GENERATED_BY)[number];

export type PersonStoryCaptionBeat = {
  mediaId: string;
  caption: string;
  /** ISO date string when known (takenAt preferred, else createdAt). */
  dateLabel: string | null;
};

export type PersonStorySnapshot = {
  body: string | null;
  sourceCaptionCount: number;
  generatedAt: string | null;
  generatedBy: PersonStoryGeneratedBy | null;
};

const llmStorySchema = z.object({
  body: z.string(),
});

const MAX_CAPTIONS_FOR_PROMPT = 48;
const MAX_STORY_CHARS = 2200;

function dateLabelFromMedia(row: Media): string | null {
  const d = row.takenAt ?? row.createdAt;
  if (!d || Number.isNaN(d.getTime())) return null;
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Collect caption + comment beats from media visible for this person (oldest → newest).
 */
export function collectCaptionBeatsFromMedia(
  rows: readonly Media[],
  commentsByMediaId: ReadonlyMap<string, readonly string[]> = new Map(),
): PersonStoryCaptionBeat[] {
  const beats: PersonStoryCaptionBeat[] = [];
  for (const row of rows) {
    if (row.moderationStatus !== "clean" || row.status !== "ready") continue;
    const caption = row.caption?.trim().replace(/\s+/g, " ") ?? "";
    if (caption) {
      beats.push({
        mediaId: row.id,
        caption,
        dateLabel: dateLabelFromMedia(row),
      });
    }
    const extras = commentsByMediaId.get(row.id) ?? [];
    for (const raw of extras) {
      const text = raw.trim().replace(/\s+/g, " ");
      if (!text) continue;
      if (isLowSignalMediaComment(text)) continue;
      beats.push({
        mediaId: row.id,
        caption: text,
        dateLabel: dateLabelFromMedia(row),
      });
    }
  }
  beats.sort((a, b) => {
    const da = a.dateLabel ?? "";
    const db = b.dateLabel ?? "";
    if (da !== db) return da.localeCompare(db);
    return a.mediaId.localeCompare(b.mediaId);
  });
  return beats;
}

/**
 * Deterministic story when LLM is unavailable or for tests.
 * Only uses caption text — never invents life events.
 */
export function composeDeterministicPersonStory(
  displayName: string,
  beats: readonly PersonStoryCaptionBeat[],
): string | null {
  if (beats.length === 0) return null;

  const name = displayName.trim() || "This person";
  const lines = beats.map((b) => {
    const when = b.dateLabel ? ` (${b.dateLabel})` : "";
    return `“${b.caption}”${when}`;
  });

  if (beats.length <= 2) {
    return `${name} shows up in family photos with a few notes worth keeping:\n\n${lines.join("\n")}`;
  }

  const head = lines.slice(0, Math.min(4, lines.length));
  const mid = lines.slice(4, Math.min(10, lines.length));
  const more =
    lines.length > 10
      ? `\n\nAnd more moments from later photos: ${lines
          .slice(10, 16)
          .map((l) => l.replace(/^“|”$/g, ""))
          .join("; ")}.`
      : "";

  const p1 = `Moments with ${name}, in the family’s own words:\n\n${head.join("\n")}`;
  const p2 =
    mid.length > 0
      ? `\n\nAs the years go on:\n\n${mid.join("\n")}`
      : "";
  return `${p1}${p2}${more}`.slice(0, MAX_STORY_CHARS);
}

async function composeLlmPersonStory(
  displayName: string,
  beats: readonly PersonStoryCaptionBeat[],
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isLlmConfigured() || beats.length === 0) return null;

  const limited = beats.slice(0, MAX_CAPTIONS_FOR_PROMPT);
  const captionBlock = limited
    .map((b, i) => {
      const when = b.dateLabel ? ` [${b.dateLabel}]` : "";
      return `${i + 1}.${when} ${b.caption}`;
    })
    .join("\n");

  const lengthHint =
    limited.length <= 2
      ? "Write 2–4 warm sentences."
      : "Write 1–3 short paragraphs (about 200–300 words max). Stay scannable.";

  try {
    const result = await completeChatJson({
      messages: [
        {
          role: "system",
          content: `You write a short family Story about one person from photo captions only.
Return JSON: {"body":"..."}.
Rules:
- Warm, readable family tone. No legal or medical claims.
- Use ONLY facts and feelings present in the captions. Never invent biography, jobs, ages, or relationships.
- You may quote a few distinctive caption phrases.
- ${lengthHint}
- If captions are sparse, keep it brief. Do not pad with generic filler.
- Do not mention that you are an AI.`,
        },
        {
          role: "user",
          content: `Person name: ${displayName}\n\nCaptions (oldest → newest):\n${captionBlock}`,
        },
      ],
      temperature: 0.4,
      signal,
    });
    const parsed = llmStorySchema.parse(JSON.parse(result.content));
    const body = parsed.body.trim().replace(/\s+\n/g, "\n").trim();
    if (!body) return null;
    return body.slice(0, MAX_STORY_CHARS);
  } catch {
    return null;
  }
}

/**
 * Build story text from caption beats (LLM when available, else deterministic).
 */
export async function generatePersonStoryBody(
  displayName: string,
  beats: readonly PersonStoryCaptionBeat[],
  signal?: AbortSignal,
): Promise<string | null> {
  if (beats.length === 0) return null;
  const llm = await composeLlmPersonStory(displayName, beats, signal);
  if (llm) return llm;
  return composeDeterministicPersonStory(displayName, beats);
}

export function personStorySnapshotFromRow(row: {
  storyBody: string | null;
  storySourceCaptionCount: number | null;
  storyGeneratedAt: Date | null;
  storyGeneratedBy: string | null;
}): PersonStorySnapshot {
  const by = row.storyGeneratedBy;
  return {
    body: row.storyBody?.trim() || null,
    sourceCaptionCount: row.storySourceCaptionCount ?? 0,
    generatedAt: row.storyGeneratedAt?.toISOString() ?? null,
    generatedBy:
      by === "system" || by === "user" ? by : null,
  };
}

/**
 * Load caption beats for a person visible to this user.
 * Returns null if the person is not accessible (outsider / wrong owner).
 */
export async function listPersonStoryCaptionBeats(
  userId: string,
  personId: string,
): Promise<{ displayName: string; beats: PersonStoryCaptionBeat[] } | null> {
  const person = await getPersonForUser(personId, userId);
  if (!person) return null;

  const visible = await listVisibleMediaLinkedToPerson(userId, personId);
  if (!visible) return null;

  const commentsByMediaId = await listCommentBodiesForMediaIds(
    visible.mediaRows.map((m) => m.id),
  );

  return {
    displayName: person.name,
    beats: collectCaptionBeatsFromMedia(visible.mediaRows, commentsByMediaId),
  };
}

/**
 * Regenerate and persist the story from currently visible captions.
 * Owner-scoped (same as Person detail). Empty captions clear the story.
 */
export async function regeneratePersonStory(input: {
  userId: string;
  personId: string;
  generatedBy?: PersonStoryGeneratedBy;
  signal?: AbortSignal;
}): Promise<PersonStorySnapshot> {
  const gathered = await listPersonStoryCaptionBeats(
    input.userId,
    input.personId,
  );
  if (!gathered) {
    throw new Error("Person not found.");
  }

  const generatedBy = input.generatedBy ?? "user";
  const body =
    gathered.beats.length === 0
      ? null
      : await generatePersonStoryBody(
          gathered.displayName,
          gathered.beats,
          input.signal,
        );

  const now = new Date();
  const db = getDb();
  const [updated] = await db
    .update(people)
    .set({
      storyBody: body,
      storySourceCaptionCount: gathered.beats.length,
      storyGeneratedAt: body ? now : null,
      storyGeneratedBy: body ? generatedBy : null,
      updatedAt: now,
    })
    .where(
      and(eq(people.id, input.personId), eq(people.userId, input.userId)),
    )
    .returning({
      storyBody: people.storyBody,
      storySourceCaptionCount: people.storySourceCaptionCount,
      storyGeneratedAt: people.storyGeneratedAt,
      storyGeneratedBy: people.storyGeneratedBy,
    });

  if (!updated) throw new Error("Person not found.");
  return personStorySnapshotFromRow(updated);
}
