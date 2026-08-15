/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetAskAiGreetingSpeechForTests,
  ASK_AI_GREETING_OPEN_CHANCE,
  shouldPlayAskAiGreetingOnOpen,
} from "@/lib/assistant/speak-greeting";

describe("shouldPlayAskAiGreetingOnOpen", () => {
  beforeEach(() => {
    __resetAskAiGreetingSpeechForTests();
  });

  it("never plays when preference is off", () => {
    expect(shouldPlayAskAiGreetingOnOpen(false, () => 0)).toBe(false);
    expect(shouldPlayAskAiGreetingOnOpen(false, () => 0.99)).toBe(false);
  });

  it("plays only within the intermittent chance window", () => {
    expect(shouldPlayAskAiGreetingOnOpen(true, () => 0)).toBe(true);
    expect(
      shouldPlayAskAiGreetingOnOpen(true, () => ASK_AI_GREETING_OPEN_CHANCE),
    ).toBe(false);
    expect(shouldPlayAskAiGreetingOnOpen(true, () => 0.99)).toBe(false);
  });
});
