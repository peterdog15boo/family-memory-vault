/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __resetAnnounceForTests,
  announce,
  registerLiveRegions,
} from "@/lib/a11y/announce";

describe("announce", () => {
  let polite: HTMLElement;
  let assertive: HTMLElement;

  beforeEach(() => {
    __resetAnnounceForTests();
    polite = document.createElement("div");
    assertive = document.createElement("div");
    registerLiveRegions({ polite, assertive });
    vi.useFakeTimers();
  });

  afterEach(() => {
    registerLiveRegions(null);
    __resetAnnounceForTests();
    vi.useRealTimers();
  });

  it("writes polite messages by default", () => {
    announce("Tag added");
    expect(polite.textContent).toBe("Tag added");
    expect(assertive.textContent).toBe("");
  });

  it("writes assertive messages for urgent updates", () => {
    announce("Session expiring", { priority: "assertive" });
    expect(assertive.textContent).toBe("Session expiring");
  });

  it("dedupes identical rapid announcements", () => {
    announce("Saved");
    announce("Saved");
    expect(polite.textContent).toBe("Saved");
    announce("Saved again");
    expect(polite.textContent).toBe("Saved again");
  });

  it("ignores blank messages", () => {
    announce("   ");
    expect(polite.textContent).toBe("");
  });
});
