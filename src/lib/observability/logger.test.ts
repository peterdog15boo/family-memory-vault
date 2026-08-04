import { afterEach, describe, expect, it, vi } from "vitest";
import { errorFields, logger } from "@/lib/observability/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits single-line JSON with event and redacted secrets", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logger.info("test.event", {
      mediaId: "m1",
      apiKey: "super-secret",
      token: "abc",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe("test.event");
    expect(parsed.level).toBe("info");
    expect(parsed.apiKey).toBe("[redacted]");
    expect(parsed.token).toBe("[redacted]");
    expect(parsed.mediaId).toBe("m1");
  });

  it("normalizes Error instances", () => {
    const fields = errorFields(new Error("boom"));
    expect(fields.errorName).toBe("Error");
    expect(fields.errorMessage).toBe("boom");
  });
});
