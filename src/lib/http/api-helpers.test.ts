import { describe, expect, it } from "vitest";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { userFacingApiError } from "@/lib/http/user-messages";
import { MemoryError } from "@/lib/memories/errors";
import { MovieError } from "@/lib/movies/errors";
import {
  checkRateLimit,
  enforceRateLimit,
} from "@/lib/security/rate-limit";
import {
  escapeLikePattern,
  likeContainsPattern,
  sanitizeSearchQuery,
  sanitizeUserText,
} from "@/lib/security/sanitize";
import {
  completeMediaSchema,
  maxBytesForContentType,
  mediaTypeFromContentType,
  presignRequestSchema,
} from "@/lib/upload/constants";

describe("API error helpers", () => {
  it("builds a consistent JSON error body", async () => {
    const res = apiError("Nope", { status: 403, code: "forbidden" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Nope", code: "forbidden" });
  });

  it("maps MovieError quota to 429", async () => {
    const res = apiErrorFromUnknown(
      new MovieError("Limit reached", { code: "quota_exceeded" }),
      "fallback",
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("quota_exceeded");
  });

  it("maps MemoryError not found to 404", async () => {
    const res = apiErrorFromUnknown(
      new MemoryError("Memory not found.", { code: "not_found" }),
      "fallback",
    );
    expect(res.status).toBe(404);
  });

  it("maps unknown errors to 500 without leaking internals", async () => {
    const res = apiErrorFromUnknown(new Error("secret stack"), "Something failed");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something failed");
    expect(body.code).toBe("internal");
  });
});

describe("userFacingApiError", () => {
  it("prefers friendly copy for known codes", () => {
    expect(userFacingApiError({ code: "rate_limited" })).toMatch(/too many/i);
    expect(userFacingApiError({ code: "r2_not_configured" })).toMatch(/storage/i);
  });

  it("keeps specific plan/quota messages from the server", () => {
    expect(
      userFacingApiError({
        code: "plan_limit",
        error: "You've used all 5 movies this month.",
      }),
    ).toBe("You've used all 5 movies this month.");
  });
});

describe("rate limit", () => {
  it("allows requests under the limit and blocks after", () => {
    const key = `test-rate-${Date.now()}-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(false);
    expect(enforceRateLimit(key, 2, 60_000)?.status).toBe(429);
  });
});

describe("sanitize helpers", () => {
  it("escapes ILIKE wildcards", () => {
    expect(escapeLikePattern("100%_done")).toBe("100\\%\\_done");
  });

  it("builds a capped contains pattern", () => {
    expect(likeContainsPattern("  alice  ")).toBe("%alice%");
    expect(likeContainsPattern("")).toBeNull();
    expect(likeContainsPattern("a".repeat(200))!.length).toBeLessThanOrEqual(
      2 + 100 + 2, // % + escaped + %  (escape may grow)
    );
  });

  it("strips control characters from user text", () => {
    expect(sanitizeUserText("Hello\u0000 world", 20)).toBe("Hello world");
    expect(sanitizeSearchQuery("  hi  ")).toBe("hi");
  });
});

describe("upload request schemas (API contract)", () => {
  it("accepts a valid presign body", () => {
    const parsed = presignRequestSchema.safeParse({
      filename: "vacation.jpg",
      contentType: "image/jpeg",
      size: 1024,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects disallowed content types", () => {
    const parsed = completeMediaSchema.safeParse({
      key: "temp/user/x.bin",
      filename: "x.exe",
      contentType: "application/octet-stream",
      size: 10,
    });
    expect(parsed.success).toBe(false);
  });

  it("maps content types to media type and max bytes", () => {
    expect(mediaTypeFromContentType("image/png")).toBe("photo");
    expect(mediaTypeFromContentType("video/mp4")).toBe("video");
    expect(maxBytesForContentType("video/mp4")).toBeGreaterThan(
      maxBytesForContentType("image/jpeg"),
    );
  });
});
