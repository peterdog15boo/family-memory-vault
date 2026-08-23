import { describe, expect, it } from "vitest";
import {
  parseMovieIdFromHref,
  resolveNotificationHref,
  sanitizeInternalPath,
} from "@/lib/notifications/links";

describe("resolveNotificationHref", () => {
  it("routes movie_ready to the specific movie, not Memories", () => {
    expect(
      resolveNotificationHref({
        type: "movie_ready",
        link: "/memories/mem_abc",
        metadata: { movieId: "mov_123", memoryId: "mem_abc" },
      }),
    ).toBe("/movies?movieId=mov_123");
  });

  it("falls back to Movies library when movieId is missing", () => {
    expect(
      resolveNotificationHref({
        type: "movie_ready",
        link: "/memories/mem_abc",
        metadata: { memoryId: "mem_abc" },
      }),
    ).toBe("/movies");
  });

  it("routes memory_created to the memory detail", () => {
    expect(
      resolveNotificationHref({
        type: "memory_created",
        link: "/memories",
        metadata: { memoryId: "mem_9" },
      }),
    ).toBe("/memories/mem_9");
  });

  it("routes media_ready with a media query", () => {
    expect(
      resolveNotificationHref({
        type: "media_ready",
        metadata: { mediaId: "media_1" },
      }),
    ).toBe("/media?mediaId=media_1");
  });

  it("routes billing and family invite defaults", () => {
    expect(
      resolveNotificationHref({ type: "storage_warning", metadata: {} }),
    ).toBe("/billing");
    expect(
      resolveNotificationHref({ type: "family_invite", metadata: {} }),
    ).toBe("/family");
  });

  it("builds family chat hash links from metadata", () => {
    expect(
      resolveNotificationHref({
        type: "family_chat",
        metadata: { threadId: "th_1", familyId: "fam_1" },
      }),
    ).toBe("/#family-chat=th_1&family=fam_1");
  });
});

describe("sanitizeInternalPath", () => {
  it("keeps app paths and strips absolute origins", () => {
    expect(sanitizeInternalPath("/movies?movieId=x")).toBe("/movies?movieId=x");
    expect(sanitizeInternalPath("https://example.com/billing")).toBe("/billing");
    expect(sanitizeInternalPath("//evil.test")).toBeNull();
  });
});

describe("parseMovieIdFromHref", () => {
  it("reads movieId from query", () => {
    expect(parseMovieIdFromHref("/movies?movieId=abc")).toBe("abc");
    expect(parseMovieIdFromHref("/movies")).toBeNull();
  });
});
