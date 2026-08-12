import { describe, expect, it } from "vitest";
import { isBetaFeedbackEnabled } from "@/lib/feedback/flags";

describe("isBetaFeedbackEnabled", () => {
  const key = "NEXT_PUBLIC_ENABLE_BETA_FEEDBACK";

  it("is off when unset or falsey", () => {
    const prev = process.env[key];
    delete process.env[key];
    expect(isBetaFeedbackEnabled()).toBe(false);
    process.env[key] = "false";
    expect(isBetaFeedbackEnabled()).toBe(false);
    process.env[key] = "0";
    expect(isBetaFeedbackEnabled()).toBe(false);
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });

  it("is on for true/1/yes/on", () => {
    const prev = process.env[key];
    for (const value of ["true", "TRUE", "1", "yes", "on"]) {
      process.env[key] = value;
      expect(isBetaFeedbackEnabled()).toBe(true);
    }
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
});
