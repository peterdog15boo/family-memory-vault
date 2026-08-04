import { describe, expect, it } from "vitest";
import {
  buildEmotionalDescription,
  buildEmotionalTitle,
  chooseEmotionalMovieStyle,
  detectEmotionalKind,
  resolveEmotionalMovieTreatment,
} from "@/lib/ai/emotional-treatment";
import type { AssistantIntent } from "@/lib/assistant/types";
import type { ResolvedIntent } from "@/lib/ai/resolve";

function intent(partial: Partial<AssistantIntent>): AssistantIntent {
  return {
    action: "create_movie",
    people: [],
    raw_prompt: "",
    ...partial,
  };
}

function resolved(partial?: Partial<ResolvedIntent>): ResolvedIntent {
  return {
    intent: intent({}),
    peopleIds: [],
    matchedPeople: [],
    unresolvedPeople: [],
    dateFilter: null,
    needsClarification: false,
    clarifyingQuestions: [],
    ...partial,
  };
}

describe("detectEmotionalKind", () => {
  it("detects memorial tributes", () => {
    expect(
      detectEmotionalKind(
        intent({
          tone: "memorial",
          raw_prompt: "Create a memorial tribute for Craig",
        }),
      ),
    ).toBe("memorial");
  });

  it("detects simple slideshow requests", () => {
    expect(
      detectEmotionalKind(
        intent({
          raw_prompt: "Create a simple slideshow of Noah from 7th grade",
        }),
      ),
    ).toBe("simple");
  });
});

describe("chooseEmotionalMovieStyle", () => {
  it("maps memorial → cinematic", () => {
    expect(
      chooseEmotionalMovieStyle(
        intent({
          tone: "memorial",
          qualities: ["humor", "depth"],
          raw_prompt: "memorial for Craig highlighting humor and depth",
        }),
      ),
    ).toBe("cinematic");
  });

  it("maps birthday → bright (Bright & Airy)", () => {
    expect(
      chooseEmotionalMovieStyle(
        intent({ tone: "birthday", raw_prompt: "Birthday movie for Noah" }),
      ),
    ).toBe("bright");
  });

  it("maps celebration → holiday", () => {
    expect(
      chooseEmotionalMovieStyle(
        intent({ tone: "celebration", raw_prompt: "Anniversary celebration" }),
      ),
    ).toBe("holiday");
  });

  it("maps simple slideshow → simple", () => {
    expect(
      chooseEmotionalMovieStyle(
        intent({ raw_prompt: "Create a simple slideshow of Noah" }),
      ),
    ).toBe("simple");
  });
});

describe("resolveEmotionalMovieTreatment", () => {
  it("uses slower cinematic pacing for memorials with tribute production", () => {
    const treatment = resolveEmotionalMovieTreatment(
      intent({
        tone: "memorial",
        qualities: ["humor", "depth"],
        raw_prompt: "tribute for Craig",
      }),
    );
    expect(treatment.style).toBe("cinematic");
    expect(treatment.settings.photoDurationMs).toBeGreaterThanOrEqual(5000);
    expect(treatment.settings.transition).toBe("fade");
    expect(treatment.settings.colorFilter).toBe("teal_orange");
    expect(treatment.settings.musicSource).toBe("library");
    expect(treatment.settings.musicTrackId).toBe("ambient-pads");
  });

  it("uses warmer brighter pacing for birthdays with music + filter", () => {
    const treatment = resolveEmotionalMovieTreatment(
      intent({ tone: "birthday", raw_prompt: "Happy birthday Noah" }),
    );
    expect(treatment.style).toBe("bright");
    expect(treatment.settings.photoDurationMs).toBeGreaterThanOrEqual(2800);
    expect(treatment.settings.includeTitles).toBe(true);
    expect(treatment.settings.colorFilter).toBe("golden_hour");
    expect(treatment.settings.musicSource).toBe("library");
    expect(treatment.settings.musicTrackId).toBe("upbeat-pop");
  });

  it("applies full classic_family production for simple slideshows", () => {
    const treatment = resolveEmotionalMovieTreatment(
      intent({ raw_prompt: "Create a simple slideshow of Noah" }),
    );
    expect(treatment.presetId).toBe("classic_family");
    expect(treatment.settings.colorFilter).toBe("warm_family");
    expect(treatment.settings.musicTrackId).toBe("soft-piano");
    expect(treatment.settings.aspectRatio).toBe("16:9");
  });
});

describe("emotional titles & descriptions", () => {
  it("builds memorial titles that surface qualities", () => {
    expect(
      buildEmotionalTitle(
        intent({
          tone: "memorial",
          people: ["Craig"],
          qualities: ["humor", "depth"],
        }),
        resolved({
          matchedPeople: [
            { id: "c1", name: "Craig", matchedOn: "Craig", score: 1 },
          ],
        }),
      ),
    ).toBe("Remembering Craig — Humor & Depth");
  });

  it("writes a warm memorial description", () => {
    const description = buildEmotionalDescription(
      intent({
        tone: "memorial",
        people: ["Craig"],
        qualities: ["humor", "depth"],
        raw_prompt: "Create a memorial tribute for Craig",
      }),
      resolved({
        matchedPeople: [
          { id: "c1", name: "Craig", matchedOn: "Craig", score: 1 },
        ],
      }),
    );
    expect(description).toMatch(/cinematic tribute/i);
    expect(description).toMatch(/humor/i);
    expect(description).toMatch(/depth/i);
  });

  it("builds birthday titles", () => {
    expect(
      buildEmotionalTitle(
        intent({ tone: "birthday", people: ["Noah"] }),
        resolved({
          matchedPeople: [
            { id: "n1", name: "Noah", matchedOn: "Noah", score: 1 },
          ],
        }),
      ),
    ).toBe("Happy Birthday, Noah");
  });
});
