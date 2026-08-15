import { describe, expect, it } from "vitest";
import {
  ASK_AI_GREETINGS,
  buildAskAiGreetingText,
  interpolateGreetingName,
  pickAskAiGreeting,
  sanitizeSpeechName,
} from "@/lib/assistant/greetings";

describe("sanitizeSpeechName", () => {
  it("uses the first name token", () => {
    expect(sanitizeSpeechName("Jeff Roberts")).toBe("Jeff");
  });

  it("rejects empty / short / unsafe values", () => {
    expect(sanitizeSpeechName("")).toBeNull();
    expect(sanitizeSpeechName("a")).toBeNull();
    expect(sanitizeSpeechName("https://evil.test")).toBeNull();
    expect(sanitizeSpeechName("user@email.com")).toBeNull();
  });

  it("truncates long names", () => {
    const long = "Supercalifragilisticexpialidocious";
    const out = sanitizeSpeechName(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(24);
  });
});

describe("interpolateGreetingName", () => {
  it("inserts the name", () => {
    expect(interpolateGreetingName("Ready when you are, {name}.", "Jeff")).toBe(
      "Ready when you are, Jeff.",
    );
  });

  it("strips placeholder when name missing", () => {
    expect(interpolateGreetingName("Hey {name}!", null)).toBe("Hey !");
  });
});

describe("buildAskAiGreetingText", () => {
  it("prefers withName when a name is present", () => {
    const g = ASK_AI_GREETINGS.find((x) => x.id === "ready")!;
    expect(buildAskAiGreetingText(g, "Jeff")).toBe("Ready when you are, Jeff.");
    expect(buildAskAiGreetingText(g, null)).toBe("Ready when you are.");
  });
});

describe("pickAskAiGreeting", () => {
  it("avoids repeating the last greeting id when possible", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) {
      ids.add(pickAskAiGreeting(null, "ready").id);
    }
    // With a non-empty pool, we should usually get something other than "ready".
    expect([...ids].some((id) => id !== "ready")).toBe(true);
  });

  it("always returns a non-empty short line", () => {
    const picked = pickAskAiGreeting("Jeff", null);
    expect(picked.text.length).toBeGreaterThan(3);
    expect(picked.text.length).toBeLessThan(120);
  });
});
