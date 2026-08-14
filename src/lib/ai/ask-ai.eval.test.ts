/**
 * Ask AI evaluation suite — verifies routing + acceptance criteria.
 *
 * Acceptance:
 * - toilet query does not mention People/name matching
 * - object queries use visual labels (visual_query / objects / scenes)
 * - person queries still resolve to People
 * - help answers remain strong (product topics + steps)
 */

import { describe, expect, it } from "vitest";
import {
  ASK_AI_EVAL_CASES,
  ASK_AI_EVAL_KNOWN_PEOPLE,
  ASK_AI_EVAL_PERSON_CATALOG,
  type AskAiEvalBucket,
  type AskAiEvalCase,
} from "@/lib/ai/ask-ai.eval";
import {
  classifyAskIntent,
  parseIntent,
  type AskIntentKind,
} from "@/lib/ai/intent";
import { resolveIntentWithCatalog } from "@/lib/ai/resolve";
import { explainSparseMediaResults } from "@/lib/ai/media-query";
import { retrieveHelpEntries } from "@/lib/ai/help";
import { answerProductHelp } from "@/lib/ai/help/retrieve";

function bucketFromKind(kind: AskIntentKind): AskAiEvalBucket | "other" {
  if (kind === "object_search" || kind === "scene_search") {
    return "object_or_scene";
  }
  if (kind === "person_search") return "person";
  if (kind === "mixed") return "mixed";
  if (kind === "help") return "help";
  return "other";
}

function visualBlob(intent: {
  visual_query?: string | null;
  objects?: string[] | null;
  scenes?: string[] | null;
  qualities?: string[] | null;
}): string {
  return [
    intent.visual_query ?? "",
    ...(intent.objects ?? []),
    ...(intent.scenes ?? []),
    ...(intent.qualities ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

async function parseEvalCase(testCase: AskAiEvalCase) {
  const intent = await parseIntent(testCase.prompt, {
    preferFallback: true,
    knownPeople: ASK_AI_EVAL_KNOWN_PEOPLE,
  });
  const kind = classifyAskIntent(intent);
  const resolved = resolveIntentWithCatalog(
    intent,
    ASK_AI_EVAL_PERSON_CATALOG,
  );
  return { intent, kind, resolved };
}

describe("Ask AI evaluation set", () => {
  it.each(ASK_AI_EVAL_CASES)(
    "$id → $expected ($prompt)",
    async (testCase) => {
      const { intent, kind } = await parseEvalCase(testCase);
      expect(bucketFromKind(kind)).toBe(testCase.expected);

      if (testCase.expected === "object_or_scene") {
        expect(intent.people).toEqual([]);
        expect(intent.action).toBe("search_media");
        const blob = visualBlob(intent);
        expect(blob.length).toBeGreaterThan(0);
        for (const hint of testCase.visualHints ?? []) {
          expect(blob).toMatch(new RegExp(hint, "i"));
        }
        // Object/scene must not invent People clarify.
        expect(
          (intent.clarifying_questions ?? []).some((q) =>
            /people|anyone named|who did you mean/i.test(q),
          ),
        ).toBe(false);
      }

      if (testCase.expected === "person") {
        expect(intent.action).toBe("search_media");
        const peopleBlob = intent.people.join(" ").toLowerCase();
        for (const hint of testCase.peopleHints ?? []) {
          expect(peopleBlob).toMatch(new RegExp(hint, "i"));
        }
      }

      if (testCase.expected === "mixed") {
        expect(intent.action).toBe("search_media");
        const blob = visualBlob(intent);
        for (const hint of testCase.visualHints ?? []) {
          expect(blob).toMatch(new RegExp(hint, "i"));
        }
        if (testCase.peopleHints?.length) {
          const peopleBlob = intent.people.join(" ").toLowerCase();
          for (const hint of testCase.peopleHints) {
            expect(peopleBlob).toMatch(new RegExp(hint, "i"));
          }
        }
      }

      if (testCase.expected === "help") {
        expect(intent.action).toBe("answer_help");
        expect(kind).toBe("help");
      }
    },
  );

  it("toilet query does not mention People/name matching (empty reply)", async () => {
    const { intent, kind, resolved } = await parseEvalCase(
      ASK_AI_EVAL_CASES.find((c) => c.id === "toilet")!,
    );
    expect(bucketFromKind(kind)).toBe("object_or_scene");
    expect(resolved.unresolvedPeople).toHaveLength(0);

    const explanation = explainSparseMediaResults({
      diagnostics: {
        matchedCount: 0,
        cleanReadyTotal: 40,
        visualLabeledTotal: 3,
        visualUnlabeledTotal: 37,
        lowVisualCoverage: true,
        visualLabeledRatio: 3 / 40,
        withPeopleOnly: null,
        withDateOnly: null,
        peopleWithoutFaces: [],
        dateFilterApplied: false,
        dateFilterConcrete: false,
        textHintsApplied: true,
        peopleMatch: "any",
        peopleIdCount: 0,
        searchMode: "visual_labels",
      },
      visualQuery: intent.visual_query,
      objects: intent.objects,
      scenes: intent.scenes,
      intentKind: kind,
      matchedPeople: resolved.matchedPeople,
    });

    const text = [
      explanation.summary,
      ...explanation.reasons,
      ...explanation.suggestions,
    ].join("\n");

    expect(text).toMatch(/toilet/i);
    expect(text).not.toMatch(/anyone named|People list|Who did you mean/i);
    expect(text).not.toMatch(/\bPeople\b/);
  });

  it("object queries use visual labels (searchMode visual_labels signal)", async () => {
    const objectCases = ASK_AI_EVAL_CASES.filter(
      (c) => c.expected === "object_or_scene",
    );
    for (const testCase of objectCases) {
      const { intent, kind } = await parseEvalCase(testCase);
      expect(["object_search", "scene_search"]).toContain(kind);
      expect(intent.people).toEqual([]);
      const blob = visualBlob(intent);
      expect(blob.length).toBeGreaterThan(0);
      // Enough signal for media-query resolveSearchMode → visual_labels
      expect(
        Boolean(intent.visual_query?.trim()) ||
          (intent.objects?.length ?? 0) > 0 ||
          (intent.scenes?.length ?? 0) > 0 ||
          (intent.qualities?.length ?? 0) > 0,
      ).toBe(true);
    }
  });

  it("person queries still resolve against the People catalog", async () => {
    for (const id of ["scott", "mom", "jeff"] as const) {
      const testCase = ASK_AI_EVAL_CASES.find((c) => c.id === id)!;
      const { intent, kind, resolved } = await parseEvalCase(testCase);
      expect(kind).toBe("person_search");
      expect(resolved.needsClarification).toBe(false);
      expect(resolved.matchedPeople.length).toBeGreaterThan(0);
      expect(resolved.peopleIds.length).toBeGreaterThan(0);
      expect(intent.people.length).toBeGreaterThan(0);
    }
  });

  it("help answers remain strong (invite + movie limits)", async () => {
    const invite = retrieveHelpEntries("how do I invite family members?");
    expect(invite[0]?.id).toBe("invite_family");
    expect(invite[0]?.steps?.length ?? 0).toBeGreaterThan(0);
    expect(invite[0]?.relatedRoutes.some((r) => r.href === "/family")).toBe(
      true,
    );

    const movies = retrieveHelpEntries(
      "how can I make more movies per month?",
    );
    expect(movies[0]?.id).toBe("movie_limits");
    expect(movies[0]?.steps?.length ?? 0).toBeGreaterThan(0);
    expect(movies[0]?.relatedRoutes.some((r) => r.href === "/billing")).toBe(
      true,
    );

    const inviteAnswer = await answerProductHelp(
      "eval-user",
      "how do I invite family members?",
    );
    expect(inviteAnswer.message.length).toBeGreaterThan(80);
    expect(inviteAnswer.message).toMatch(/family|invite/i);
    expect(inviteAnswer.topicIds).toContain("invite_family");

    const movieAnswer = await answerProductHelp(
      "eval-user",
      "how can I make more movies per month?",
    );
    expect(movieAnswer.message.length).toBeGreaterThan(80);
    expect(movieAnswer.message).toMatch(/movie|billing|plan|upgrade/i);
    expect(movieAnswer.topicIds).toContain("movie_limits");
  });
});
