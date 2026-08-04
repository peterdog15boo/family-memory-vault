import { describe, expect, it } from "vitest";
import {
  cleanVisionTerms,
  expandRekognitionLabel,
  normalizeVisionResult,
  normalizeVisionToken,
} from "@/lib/ai/vision";
import {
  expandVisualQueryTerms,
  scoreVisualMatch,
  suggestVisualAlternatives,
} from "@/lib/ai/visual-search";
import {
  extractVisualQuery,
  parseIntentFallback,
  scrubFalsePeople,
} from "@/lib/ai/intent";

describe("vision normalize", () => {
  it("normalizes tokens and drops ultra-generic noise", () => {
    expect(normalizeVisionToken("Bounce_House!!")).toBe("bounce house");
    expect(cleanVisionTerms(["Person", "Inflatable", "photo", "Cake"])).toEqual([
      "inflatable",
      "cake",
    ]);
  });

  it("keeps people categories and indoor/outdoor settings", () => {
    expect(
      cleanVisionTerms(["man", "woman", "indoors", "outdoors", "suit", "photo"]),
    ).toEqual(
      expect.arrayContaining(["man", "woman", "indoors", "outdoors", "suit"]),
    );
    expect(cleanVisionTerms(["photo", "image", "thing"])).toEqual([]);
  });

  it("builds a normalized vision result", () => {
    const result = normalizeVisionResult({
      caption: "Kids on an Inflatable Obstacle Course",
      tags: ["Inflatable", "Obstacle Course", "Person", "Playground"],
      objects: ["bounce house", "Inflatable"],
      scenes: ["Playground", "Outdoor"],
      description: "Children playing on a large inflatable obstacle course.",
      provider: "test",
    });
    expect(result.caption.toLowerCase()).toContain("inflatable");
    expect(result.tags).toEqual(
      expect.arrayContaining(["inflatable", "obstacle course", "playground"]),
    );
    expect(result.tags).not.toContain("person");
    expect(result.objects).toEqual(
      expect.arrayContaining(["bounce house", "inflatable"]),
    );
    expect(result.scenes).toEqual(
      expect.arrayContaining(["playground", "outdoor"]),
    );
    expect(result.provider).toBe("test");
  });

  it("maps Rekognition labels to friendly searchable terms", () => {
    expect(expandRekognitionLabel("Necktie")).toEqual(
      expect.arrayContaining(["tie", "necktie"]),
    );
    const result = normalizeVisionResult({
      caption: "man in a suit",
      tags: ["Necktie", "Suit", "Man", "Indoors"],
      objects: ["Necktie", "Suit"],
      scenes: ["Indoors"],
      description: "A man wearing a suit and tie indoors.",
      provider: "rekognition.detect_labels",
    });
    expect(result.objects).toEqual(
      expect.arrayContaining(["tie", "necktie", "suit"]),
    );
    expect(result.scenes).toEqual(
      expect.arrayContaining(["indoors", "indoor", "interior"]),
    );
    expect(result.tags).toEqual(expect.arrayContaining(["man", "men", "male"]));
  });
});

describe("visual search", () => {
  it("expands inflatable / bounce house synonyms", () => {
    const terms = expandVisualQueryTerms("inflatable obstacle courses");
    expect(terms).toEqual(
      expect.arrayContaining([
        "inflatable",
        "obstacle course",
        "bounce house",
      ]),
    );
  });

  it("expands cigar / suit / tie / indoors / men synonyms", () => {
    expect(expandVisualQueryTerms("cigars")).toEqual(
      expect.arrayContaining(["cigar", "smoking", "tobacco"]),
    );
    expect(expandVisualQueryTerms("suits")).toEqual(
      expect.arrayContaining(["suit", "tuxedo", "formalwear"]),
    );
    expect(expandVisualQueryTerms("ties")).toEqual(
      expect.arrayContaining(["tie", "necktie"]),
    );
    expect(expandVisualQueryTerms("indoors")).toEqual(
      expect.arrayContaining(["indoor", "inside", "interior"]),
    );
    expect(expandVisualQueryTerms("gentlemen")).toEqual(
      expect.arrayContaining(["man", "men", "male"]),
    );
    expect(expandVisualQueryTerms("beach")).toEqual(
      expect.arrayContaining(["ocean", "shore", "sand"]),
    );
  });

  it("scores caption/object hits higher for specific phrases", () => {
    const terms = expandVisualQueryTerms("birthday cake");
    const hit = scoreVisualMatch(terms, {
      caption: "Birthday cake with candles",
      tags: ["cake", "party"],
      objects: ["birthday cake"],
      scenes: ["celebration"],
    });
    const miss = scoreVisualMatch(terms, {
      caption: "Family picnic",
      tags: ["park"],
      objects: ["blanket"],
      scenes: ["outdoors"],
    });
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeGreaterThan(miss);
  });

  it("ranks object field hits above caption-only hits", () => {
    const terms = expandVisualQueryTerms("cigar");
    const objectHit = scoreVisualMatch(terms, {
      caption: "Evening gathering",
      objects: ["cigar"],
      tags: ["smoking"],
      scenes: ["indoors"],
    });
    const captionOnly = scoreVisualMatch(terms, {
      caption: "Someone holding a cigar",
      objects: [],
      tags: [],
      scenes: [],
    });
    expect(objectHit).toBeGreaterThan(captionOnly);
  });

  it("suggests broader alternatives when empty", () => {
    const suggestions = suggestVisualAlternatives("inflatable obstacle courses");
    expect(suggestions.some((s) => /bounce house|inflatable|obstacle/i.test(s))).toBe(
      true,
    );
  });
});

describe("visual intent", () => {
  it("extracts visual_query from images with … prompts", () => {
    expect(
      extractVisualQuery("show me images with inflatable obstacle courses"),
    ).toMatch(/inflatable obstacle course/i);
  });

  it("extracts object and scene queries without treating them as people", () => {
    expect(extractVisualQuery("show me photos of cigars")).toMatch(/cigar/i);
    expect(extractVisualQuery("show me suits")).toMatch(/suit/i);
    expect(extractVisualQuery("show me ties")).toMatch(/tie/i);
    expect(extractVisualQuery("show me beach photos")).toMatch(/beach/i);
    expect(extractVisualQuery("show me photos taken indoors")).toMatch(
      /indoor/i,
    );
    expect(extractVisualQuery("show me men")).toMatch(/men|man/i);
    expect(extractVisualQuery("photos of Scott")).toBeUndefined();
  });

  it("parses bounce house / inflatable searches without asking for people", () => {
    const intent = parseIntentFallback(
      "Show me images with inflatable obstacle courses",
    );
    expect(intent.action).toBe("search_media");
    expect(intent.people).toEqual([]);
    expect(intent.visual_query).toMatch(/inflatable/i);
    expect(intent.clarifying_questions ?? []).toHaveLength(0);
  });

  it("parses cigar / suit / indoor / gentlemen as visual search", () => {
    for (const prompt of [
      "show me photos of cigars",
      "show me photos of suits",
      "show me ties",
      "show me photos taken indoors",
      "show me gentlemen",
      "show me beach photos",
    ]) {
      const intent = parseIntentFallback(prompt);
      expect(intent.action, prompt).toBe("search_media");
      expect(intent.people, prompt).toEqual([]);
      expect(intent.visual_query || intent.qualities?.join(" "), prompt).toBeTruthy();
      expect(intent.clarifying_questions ?? [], prompt).toHaveLength(0);
    }
  });

  it("keeps person-name queries on the People path", () => {
    const scrubbed = scrubFalsePeople("show me photos of Scott", ["Scott"]);
    expect(scrubbed.people).toEqual(["Scott"]);
    expect(scrubbed.qualities).not.toContain("scott");

    const intent = parseIntentFallback("show me photos of Scott");
    expect(intent.people.map((p) => p.toLowerCase())).toContain("scott");
    expect(intent.visual_query?.toLowerCase()).not.toBe("scott");
  });

  it("parses slideshow of bounce house with date", () => {
    const intent = parseIntentFallback(
      "Create a slideshow of bounce house photos from last summer",
      { now: new Date("2026-07-28T12:00:00Z") },
    );
    expect(intent.action).toBe("create_movie");
    expect(intent.visual_query).toMatch(/bounce house/i);
    expect(intent.date_range?.label).toBe("last summer");
  });
});
