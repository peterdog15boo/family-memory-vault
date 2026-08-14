import { describe, expect, it } from "vitest";
import {
  classifyAskIntent,
  parseIntent,
  parseIntentFallback,
} from "@/lib/ai/intent";
import { resolveIntentWithCatalog } from "@/lib/ai/resolve";

describe("parseIntentFallback", () => {
  it("parses slideshow of Noah from 7th grade", () => {
    const intent = parseIntentFallback(
      "Create a slideshow of Noah images from 7th grade",
    );
    expect(intent.action).toBe("create_movie");
    expect(intent.people).toContain("Noah");
    expect(intent.date_range?.label).toBe("7th grade");
    expect(intent.theme_preference).toBe("simple");
    expect(intent.raw_prompt).toContain("Noah");
  });

  it("parses memorial tribute for Craig with qualities", () => {
    const intent = parseIntentFallback(
      "Create a memorial tribute for Craig highlighting his humor and depth",
    );
    expect(intent.action).toBe("create_movie");
    expect(intent.people).toContain("Craig");
    expect(intent.tone).toBe("memorial");
    expect(intent.qualities).toEqual(
      expect.arrayContaining(["humor", "depth"]),
    );
    expect(intent.theme_preference).toBe("cinematic");
    expect(intent.title_suggestion).toMatch(/Craig/i);
  });

  it("parses search for Grandpa fishing", () => {
    const intent = parseIntentFallback("Show me photos of Grandpa fishing");
    expect(intent.action).toBe("search_media");
    expect(intent.people).toContain("Grandpa");
    expect(intent.qualities).toEqual(expect.arrayContaining(["fishing"]));
  });

  it("extracts lowercase people and kinship", () => {
    expect(
      parseIntentFallback("show me photos of noah").people,
    ).toContain("Noah");
    expect(parseIntentFallback("photos of grandpa").people).toContain("Grandpa");
  });

  it("does not treat scene objects as people", () => {
    const intent = parseIntentFallback("Show me a person smoking a cigar");
    expect(intent.people).toEqual([]);
    expect(intent.qualities).toEqual(
      expect.arrayContaining(["cigar"]),
    );
    expect(intent.action).toBe("search_media");
  });

  it("returns clarify for empty prompts and answer_help for help", () => {
    expect(parseIntentFallback("").action).toBe("clarify");
    expect(parseIntentFallback("help").action).toBe("answer_help");
  });

  it("classifies product how-to as answer_help, not photo search", () => {
    expect(
      parseIntentFallback("How do I invite family members to join?").action,
    ).toBe("answer_help");
    expect(
      parseIntentFallback("How can I make more than 5 movies per month?")
        .action,
    ).toBe("answer_help");
    expect(parseIntentFallback("Where do I create a Memory?").action).toBe(
      "answer_help",
    );
    expect(
      parseIntentFallback("Why don’t my photos show up right away?").action,
    ).toBe("answer_help");
    expect(parseIntentFallback("How do I use Digital Legacy?").action).toBe(
      "answer_help",
    );
    expect(parseIntentFallback("How do I change my avatar?").action).toBe(
      "answer_help",
    );
  });

  it("keeps photo search for visual requests", () => {
    expect(parseIntentFallback("Show me beach photos").action).toBe(
      "search_media",
    );
  });

  it("keeps mixed find + how-to on search_media", () => {
    expect(
      parseIntentFallback(
        "find beach photos and tell me how to make a movie",
      ).action,
    ).toBe("search_media");
  });

  it("resolves last summer relative to now", () => {
    const intent = parseIntentFallback("Show me photos from last summer", {
      now: new Date("2026-07-27T12:00:00Z"),
    });
    expect(intent.action).toBe("search_media");
    expect(intent.date_range?.label).toBe("last summer");
    expect(intent.date_range?.start).toBe("2025-06-01");
    expect(intent.date_range?.end).toBe("2025-08-31");
  });

  it("parses inflatable obstacle course visual search", () => {
    const intent = parseIntentFallback(
      "Show me images with inflatable obstacle courses",
    );
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual([]);
    expect(intent.visual_query).toMatch(/inflatable obstacle course/i);
  });

  it("parses private document category creation", () => {
    const intent = parseIntentFallback(
      "Create a Contracts category and upload this document",
    );
    expect(intent.action).toBe("create_document_category");
    expect(intent.document_category).toBe("Contracts");
  });

  it("parses adding a legacy attorney contact", () => {
    const intent = parseIntentFallback(
      "Add an attorney contact named Sarah for legacy planning",
    );
    expect(intent.action).toBe("add_legacy_contact");
    expect(intent.legacy_contact_name).toBe("Sarah");
    expect(intent.legacy_contact_category).toBe("attorney");
  });

  it("parses a legacy checklist review request", () => {
    const intent = parseIntentFallback(
      "What documents do I still need for my digital legacy checklist?",
    );
    expect(intent.action).toBe("review_legacy_checklist");
  });
});

describe("parseIntent", () => {
  it("uses fallback when preferFallback is set", async () => {
    const intent = await parseIntent(
      "Create a slideshow of Noah images from 7th grade",
      { preferFallback: true },
    );
    expect(intent.action).toBe("create_movie");
    expect(intent._meta?.source).toBe("fallback");
    expect(intent.people).toContain("Noah");
  });

  it("uses injected LLM completer when provided", async () => {
    const intent = await parseIntent("Make something nice", {
      llmComplete: async () => ({
        content: JSON.stringify({
          action: "create_movie",
          people: ["Noah"],
          date_range: { label: "2022" },
          tone: "simple",
          qualities: null,
          theme_preference: "simple",
          title_suggestion: "Noah 2022",
          clarifying_questions: null,
          confidence: 0.91,
        }),
        model: "test-model",
        usage: { promptTokens: 10, completionTokens: 20 },
      }),
    });
    expect(intent.action).toBe("create_movie");
    expect(intent.people).toEqual(["Noah"]);
    expect(intent._meta?.source).toBe("llm");
    expect(intent._meta?.model).toBe("test-model");
  });

  it("clarifies when mentioned people are not in knownPeople", async () => {
    const intent = await parseIntent(
      "Create a slideshow of Noah images from 7th grade",
      {
        preferFallback: true,
        knownPeople: ["Craig", "Emma"],
      },
    );
    expect(intent.action).toBe("clarify");
    expect(intent.clarifying_questions?.some((q) => /Noah/i.test(q))).toBe(
      true,
    );
  });

  it("resolves people to known account spellings", async () => {
    const intent = await parseIntent(
      "Create a slideshow of Noah images from 7th grade",
      {
        preferFallback: true,
        knownPeople: ["Noah Roberts", "Craig"],
      },
    );
    expect(intent.action).toBe("create_movie");
    expect(intent.people).toEqual(["Noah Roberts"]);
  });

  it("matches lowercase known people from the prompt", async () => {
    const intent = await parseIntent("show me photos of noah", {
      preferFallback: true,
      knownPeople: ["Noah Roberts", "Craig"],
    });
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual(["Noah Roberts"]);
  });

  it("scrubs LLM-invented object names like Cigars", async () => {
    const intent = await parseIntent("Show me a person smoking a cigar", {
      knownPeople: ["Noah Roberts", "Craig"],
      llmComplete: async () => ({
        content: JSON.stringify({
          action: "search_media",
          people: ["Cigars"],
          date_range: null,
          tone: null,
          qualities: null,
          theme_preference: null,
          title_suggestion: null,
          clarifying_questions: null,
          confidence: 0.8,
        }),
        model: "test-model",
        usage: { promptTokens: 1, completionTokens: 1 },
      }),
    });
    expect(intent.people).toEqual([]);
    expect(intent.qualities).toEqual(expect.arrayContaining(["cigar"]));
    expect(intent.action).toBe("search_media");
  });

  it("falls back when LLM throws", async () => {
    const intent = await parseIntent(
      "Show me photos of Grandpa fishing",
      {
        llmComplete: async () => {
          throw new Error("boom");
        },
      },
    );
    expect(intent._meta?.source).toBe("fallback");
    expect(intent.action).toBe("search_media");
    expect(intent.people).toContain("Grandpa");
  });
});

describe("Ask AI intent routing (person vs object/scene)", () => {
  it('routes "show me photos of a toilet" as object search, not a person', async () => {
    const intent = await parseIntent("show me photos of a toilet", {
      preferFallback: true,
      knownPeople: ["Scott", "Noah Roberts"],
    });
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual([]);
    expect(
      intent.visual_query?.toLowerCase() ||
        intent.objects?.join(" ").toLowerCase() ||
        intent.qualities?.join(" ").toLowerCase(),
    ).toMatch(/toilet/);
    expect(intent.clarifying_questions ?? []).toHaveLength(0);
    expect(classifyAskIntent(intent)).toBe("object_search");

    const resolved = resolveIntentWithCatalog(intent, [
      { id: "scott", name: "Scott" },
      { id: "noah", name: "Noah Roberts" },
    ]);
    expect(resolved.needsClarification).toBe(false);
    expect(resolved.unresolvedPeople).toHaveLength(0);
    expect(
      resolved.clarifyingQuestions.some((q) =>
        /couldn't find anyone named/i.test(q),
      ),
    ).toBe(false);
  });

  it('routes "show me beach photos" as scene search', () => {
    const intent = parseIntentFallback("show me beach photos");
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual([]);
    expect(intent.visual_query?.toLowerCase()).toMatch(/beach/);
    expect(classifyAskIntent(intent)).toBe("scene_search");
  });

  it('routes "show me photos of Scott" as person search', async () => {
    const intent = await parseIntent("show me photos of Scott", {
      preferFallback: true,
      knownPeople: ["Scott", "Noah Roberts"],
    });
    expect(intent.action).toBe("search_media");
    expect(intent.people.map((p) => p.toLowerCase())).toContain("scott");
    expect(classifyAskIntent(intent)).toBe("person_search");
  });

  it('routes "show me Scott at the beach" as mixed person + scene', async () => {
    const intent = await parseIntent("show me Scott at the beach", {
      preferFallback: true,
      knownPeople: ["Scott"],
    });
    expect(intent.action).toBe("search_media");
    expect(intent.people.map((p) => p.toLowerCase())).toContain("scott");
    expect(
      [
        intent.visual_query,
        ...(intent.scenes ?? []),
        ...(intent.qualities ?? []),
        ...(intent.objects ?? []),
      ]
        .join(" ")
        .toLowerCase(),
    ).toMatch(/beach/);
    expect(classifyAskIntent(intent)).toBe("mixed");
  });

  it('routes "how do I invite family members" as help', () => {
    const intent = parseIntentFallback("how do I invite family members");
    expect(intent.action).toBe("answer_help");
    expect(classifyAskIntent(intent)).toBe("help");
  });

  it("demotes LLM-invented person A Toilet into visual search", async () => {
    const intent = await parseIntent("show me photos of a toilet", {
      knownPeople: ["Scott"],
      llmComplete: async () => ({
        content: JSON.stringify({
          action: "search_media",
          people: ["A Toilet"],
          date_range: null,
          tone: null,
          qualities: null,
          objects: null,
          scenes: null,
          visual_query: null,
          theme_preference: null,
          title_suggestion: null,
          clarifying_questions: null,
          confidence: 0.9,
        }),
        model: "test-model",
        usage: { promptTokens: 1, completionTokens: 1 },
      }),
    });
    expect(intent.people).toEqual([]);
    expect(intent.action).toBe("search_media");
    expect(
      [
        intent.visual_query,
        ...(intent.objects ?? []),
        ...(intent.qualities ?? []),
      ]
        .join(" ")
        .toLowerCase(),
    ).toMatch(/toilet/);
    expect(intent.clarifying_questions ?? []).toHaveLength(0);
  });

  it("tries visual search first for photos of unknown names (not Who did you mean)", async () => {
    const intent = await parseIntent("show me photos of Scott", {
      preferFallback: true,
      knownPeople: ["Noah Roberts"],
    });
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual([]);
    expect(
      [
        intent.visual_query,
        ...(intent.objects ?? []),
        ...(intent.qualities ?? []),
      ]
        .join(" ")
        .toLowerCase(),
    ).toMatch(/scott/);
    expect(
      (intent.clarifying_questions ?? []).some((q) =>
        /who did you mean|which person/i.test(q),
      ),
    ).toBe(false);
    expect(classifyAskIntent(intent)).toBe("object_search");
  });

  it("does not ask Who did you mean for ordinary object nouns", async () => {
    const intent = await parseIntent("show me photos of cigars", {
      preferFallback: true,
      knownPeople: ["Scott"],
    });
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual([]);
    expect(
      (intent.clarifying_questions ?? []).some((q) =>
        /who did you mean|couldn't match/i.test(q),
      ),
    ).toBe(false);
  });
});
