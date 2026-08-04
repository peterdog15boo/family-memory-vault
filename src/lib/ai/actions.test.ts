import { describe, expect, it } from "vitest";
import {
  buildMemoryTitle,
  chooseMovieStyle,
  MIN_MEDIA_FOR_MOVIE,
} from "@/lib/ai/actions";
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

describe("chooseMovieStyle", () => {
  it("prefers cinematic for memorial / tribute", () => {
    expect(
      chooseMovieStyle(
        intent({
          tone: "memorial",
          raw_prompt: "Create a memorial tribute for Craig",
        }),
      ),
    ).toBe("cinematic");

    expect(
      chooseMovieStyle(
        intent({
          raw_prompt: "Make a tribute video for Dad",
          theme_preference: "simple",
        }),
      ),
    ).toBe("cinematic");
  });

  it("honors explicit theme_preference when not memorial", () => {
    expect(
      chooseMovieStyle(
        intent({
          theme_preference: "vintage",
          raw_prompt: "Make a vintage slideshow",
        }),
      ),
    ).toBe("vintage");
  });

  it("maps birthday tone to bright", () => {
    expect(
      chooseMovieStyle(
        intent({ tone: "birthday", raw_prompt: "Birthday movie for Noah" }),
      ),
    ).toBe("bright");
  });
});

describe("buildMemoryTitle", () => {
  it("uses title_suggestion when present", () => {
    expect(
      buildMemoryTitle(
        intent({ title_suggestion: "Noah — 7th Grade" }),
        resolved(),
      ),
    ).toBe("Noah — 7th Grade");
  });

  it("builds memorial titles from matched people and qualities", () => {
    expect(
      buildMemoryTitle(
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

  it("combines person + date label", () => {
    expect(
      buildMemoryTitle(
        intent({ people: ["Noah"] }),
        resolved({
          matchedPeople: [
            { id: "n1", name: "Noah Roberts", matchedOn: "Noah", score: 1 },
          ],
          dateFilter: {
            label: "7th grade",
            isConcrete: false,
          },
        }),
      ),
    ).toBe("Noah Roberts — 7th Grade");
  });
});

describe("thresholds", () => {
  it("exports a sensible movie minimum", () => {
    expect(MIN_MEDIA_FOR_MOVIE).toBeGreaterThanOrEqual(3);
  });
});
