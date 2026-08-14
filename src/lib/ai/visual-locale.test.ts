import { describe, expect, it } from "vitest";
import {
  classifyAskIntent,
  extractVisualQuery,
  parseIntentFallback,
} from "@/lib/ai/intent";
import {
  buildVisualSearchTerms,
  expandVisualQueryTerms,
} from "@/lib/ai/visual-search";
import {
  isProductHelpQuestion,
  retrieveHelpEntries,
  shouldOverrideWithProductHelp,
} from "@/lib/ai/help";

describe("multilingual visual query → English AI tags", () => {
  it("ES: inodoro expands to toilet/bathroom", () => {
    expect(expandVisualQueryTerms("inodoro")).toEqual(
      expect.arrayContaining(["toilet", "bathroom", "restroom"]),
    );
    expect(buildVisualSearchTerms("muéstrame fotos de un inodoro")).toEqual(
      expect.arrayContaining(["toilet", "inodoro"]),
    );
  });

  it("ES: playa / baño expand to beach / bathroom", () => {
    expect(expandVisualQueryTerms("playa")).toEqual(
      expect.arrayContaining(["beach", "ocean", "shore"]),
    );
    expect(expandVisualQueryTerms("baño")).toEqual(
      expect.arrayContaining(["bathroom", "toilet"]),
    );
  });

  it("FR: gâteau / voiture expand to cake / car", () => {
    expect(expandVisualQueryTerms("gâteau")).toEqual(
      expect.arrayContaining(["cake", "dessert"]),
    );
    expect(expandVisualQueryTerms("voiture")).toEqual(
      expect.arrayContaining(["car", "automobile"]),
    );
  });

  it("DE: Strand expands to beach", () => {
    expect(expandVisualQueryTerms("Strand")).toEqual(
      expect.arrayContaining(["beach", "shore"]),
    );
  });

  it("EN: toilet still expands", () => {
    expect(expandVisualQueryTerms("toilet")).toEqual(
      expect.arrayContaining(["bathroom", "restroom"]),
    );
  });
});

describe("multilingual Ask AI intent routing", () => {
  it("ES: muéstrame fotos de un inodoro → object_search with toilet terms", () => {
    const intent = parseIntentFallback("muéstrame fotos de un inodoro");
    expect(intent.action).toBe("search_media");
    expect(extractVisualQuery(intent.raw_prompt)?.toLowerCase()).toMatch(
      /inodoro/,
    );
    expect(classifyAskIntent(intent)).toBe("object_search");
    const terms = buildVisualSearchTerms(
      intent.visual_query,
      ...(intent.objects ?? []),
      intent.raw_prompt,
    );
    expect(terms).toEqual(expect.arrayContaining(["toilet", "inodoro"]));
  });

  it("ES: fotos de la playa → scene/object search with beach terms", () => {
    const intent = parseIntentFallback("fotos de la playa");
    expect(intent.action).toBe("search_media");
    expect(extractVisualQuery(intent.raw_prompt)?.toLowerCase()).toMatch(
      /playa/,
    );
    const kind = classifyAskIntent(intent);
    expect(["scene_search", "object_search"]).toContain(kind);
    expect(
      buildVisualSearchTerms(intent.visual_query, intent.raw_prompt),
    ).toEqual(expect.arrayContaining(["beach", "playa"]));
  });

  it("FR: photos de gâteau → cake terms", () => {
    const intent = parseIntentFallback("photos de gâteau");
    expect(intent.action).toBe("search_media");
    expect(extractVisualQuery(intent.raw_prompt)?.toLowerCase()).toMatch(
      /g[aâ]?teau|gateau/,
    );
    expect(
      buildVisualSearchTerms(intent.visual_query, intent.raw_prompt),
    ).toEqual(expect.arrayContaining(["cake"]));
  });

  it("DE: Fotos vom Strand → beach terms", () => {
    const intent = parseIntentFallback("Fotos vom Strand");
    expect(intent.action).toBe("search_media");
    expect(extractVisualQuery(intent.raw_prompt)?.toLowerCase()).toMatch(
      /strand/,
    );
    expect(
      buildVisualSearchTerms(intent.visual_query, intent.raw_prompt),
    ).toEqual(expect.arrayContaining(["beach", "strand"]));
  });

  it("EN: show me photos of a toilet still works", () => {
    const intent = parseIntentFallback("show me photos of a toilet");
    expect(intent.action).toBe("search_media");
    expect(classifyAskIntent(intent)).toBe("object_search");
    expect(extractVisualQuery(intent.raw_prompt)?.toLowerCase()).toMatch(
      /toilet/,
    );
  });

  it("Person: fotos de Craig stays person_search (not object)", () => {
    const intent = parseIntentFallback("fotos de Craig", {
      knownPeople: ["Craig"],
    });
    expect(intent.people.map((p) => p.toLowerCase())).toContain("craig");
    // Visual extraction should not treat Craig as an object noun.
    const kind = classifyAskIntent(intent);
    expect(kind).toBe("person_search");
  });

  it("Help: ¿cómo invito a mi familia? routes to product help", () => {
    const prompt = "¿cómo invito a mi familia?";
    expect(isProductHelpQuestion(prompt)).toBe(true);
    expect(
      shouldOverrideWithProductHelp({
        action: "clarify",
        raw_prompt: prompt,
      }),
    ).toBe(true);
    const intent = parseIntentFallback(prompt);
    expect(intent.action).toBe("answer_help");
    expect(classifyAskIntent(intent)).toBe("help");
    expect(retrieveHelpEntries(prompt)[0]?.id).toBe("invite_family");
  });
});
