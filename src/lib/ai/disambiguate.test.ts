import { describe, expect, it } from "vitest";
import {
  disambiguatePeopleVsVisual,
  extractPhotosOfPhrase,
  matchKnownPersonName,
  shouldAskWhoDidYouMean,
} from "@/lib/ai/disambiguate";
import { isCommonObjectOrSceneTerm } from "@/lib/ai/visual-lexicon";

describe("visual lexicon", () => {
  it("covers household, events, places, clothing, animals, vehicles", () => {
    for (const term of [
      "toilet",
      "kitchen",
      "beach",
      "wedding",
      "birthday",
      "suit",
      "dog",
      "car",
      "cigar",
    ]) {
      expect(isCommonObjectOrSceneTerm(term)).toBe(true);
    }
  });

  it("does not treat typical given names as objects", () => {
    expect(isCommonObjectOrSceneTerm("scott")).toBe(false);
    expect(isCommonObjectOrSceneTerm("noah")).toBe(false);
  });
});

describe("disambiguatePeopleVsVisual", () => {
  const known = ["Scott", "Noah Roberts"];

  it("routes high-confidence People matches to person_search", () => {
    const result = disambiguatePeopleVsVisual({
      candidate: "Scott",
      prompt: "show me photos of Scott",
      knownPeople: known,
    });
    expect(result.route).toBe("person");
    expect(result.preferVisual).toBe(false);
    expect(result.askWhoDidYouMean).toBe(false);
  });

  it("routes common object vocabulary to visual", () => {
    const result = disambiguatePeopleVsVisual({
      candidate: "toilet",
      prompt: "show me photos of a toilet",
      knownPeople: known,
    });
    expect(result.preferVisual).toBe(true);
    expect(["object", "scene", "visual"]).toContain(result.route);
  });

  it('tries visual first for "photos of <unknown>"', () => {
    const result = disambiguatePeopleVsVisual({
      candidate: "Scott",
      prompt: "show me photos of Scott",
      knownPeople: ["Noah Roberts"],
    });
    expect(result.preferVisual).toBe(true);
    expect(result.route).toBe("visual");
    expect(result.reason).toBe("photos_of_unknown_try_visual_first");
  });

  it("asks Who did you mean only for ambiguous person matches", () => {
    expect(
      shouldAskWhoDidYouMean({
        personIntentLikely: true,
        ambiguousPersonMatch: true,
        isNormalObject: false,
      }),
    ).toBe(true);
    expect(
      shouldAskWhoDidYouMean({
        personIntentLikely: true,
        ambiguousPersonMatch: true,
        isNormalObject: true,
      }),
    ).toBe(false);
    expect(
      shouldAskWhoDidYouMean({
        personIntentLikely: false,
        ambiguousPersonMatch: true,
        isNormalObject: false,
      }),
    ).toBe(false);
  });

  it("extracts photos-of phrases", () => {
    expect(extractPhotosOfPhrase("show me photos of a toilet")).toMatch(
      /toilet/i,
    );
    expect(matchKnownPersonName("Scott", known)).toBe("Scott");
    expect(matchKnownPersonName("Scott", ["Noah"])).toBeNull();
  });
});
