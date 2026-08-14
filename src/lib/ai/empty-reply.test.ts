import { describe, expect, it } from "vitest";
import {
  buildEmptySearchReply,
  buildObjectSceneEmptyReply,
  buildPersonEmptyReply,
  formatObjectScenePhrase,
  formatEmptySearchMessage,
} from "@/lib/ai/empty-reply";

describe("formatObjectScenePhrase", () => {
  it("adds an indefinite article for singular nouns", () => {
    expect(formatObjectScenePhrase("toilet")).toBe("a toilet");
    expect(formatObjectScenePhrase("ocean")).toBe("an ocean");
  });

  it("keeps plurals and adverbial scenes bare", () => {
    expect(formatObjectScenePhrase("suits")).toBe("suits");
    expect(formatObjectScenePhrase("indoors")).toBe("indoors");
  });
});

describe("empty search replies by intent", () => {
  it("builds object/scene empty copy with upload, related terms, and analysis wait", () => {
    const reply = buildObjectSceneEmptyReply({
      visualQuery: "toilet",
      cleanReadyTotal: 20,
      visualLabeledTotal: 2,
      visualUnlabeledTotal: 18,
      includeAdminHint: true,
    });
    expect(reply.summary).toBe(
      "I couldn’t find photos of a toilet in your library yet.",
    );
    expect(reply.lowVisualCoverage).toBe(true);
    expect(
      reply.suggestions.some((s) => /still need visual analysis/i.test(s)),
    ).toBe(true);
    expect(reply.suggestions.some((s) => /upload more photos/i.test(s))).toBe(
      true,
    );
    expect(reply.suggestions.some((s) => /add a tag|manual tags/i.test(s))).toBe(
      true,
    );
    expect(reply.suggestions.some((s) => /related terms/i.test(s))).toBe(true);
    expect(
      reply.suggestions.some((s) => /enqueue-scene-analysis/i.test(s)),
    ).toBe(true);
    expect(reply.suggestions.some((s) => /anyone named|People/i.test(s))).toBe(
      false,
    );
  });

  it("builds person empty copy about People and assigning faces", () => {
    const reply = buildPersonEmptyReply({
      peopleNames: ["Scott"],
      hasCatalogMatch: false,
      unresolvedPeople: [
        { query: "Scott", reason: "not_found", candidates: [] },
      ],
    });
    expect(reply.summary).toBe("I couldn’t find anyone named Scott in People.");
    expect(reply.suggestions.some((s) => /Check People/i.test(s))).toBe(true);
    expect(reply.suggestions.some((s) => /assign faces/i.test(s))).toBe(true);
  });

  it("never uses person fallback for object_search intent", () => {
    const reply = buildEmptySearchReply({
      intentKind: "object_search",
      visualQuery: "toilet",
      peopleNames: ["Scott"],
      matchedPeople: [
        { id: "s", name: "Scott", matchedOn: "Scott", score: 1 },
      ],
    });
    expect(reply.kind).toBe("object_scene");
    expect(reply.summary).toMatch(/photos of a toilet/i);
    expect(reply.summary).not.toMatch(/anyone named/i);
    const message = formatEmptySearchMessage(reply);
    expect(message).not.toMatch(/anyone named|Manually assign faces/i);
  });

  it("routes person_search to person empty copy", () => {
    const reply = buildEmptySearchReply({
      intentKind: "person_search",
      peopleNames: ["Scott"],
      hasCatalogMatch: false,
    });
    expect(reply.kind).toBe("person");
    expect(reply.summary).toMatch(/anyone named Scott in People/i);
  });
});
