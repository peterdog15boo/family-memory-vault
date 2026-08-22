import { afterEach, describe, expect, it } from "vitest";
import {
  BETA_PLAN_BADGE,
  betaPlanSuccessMessage,
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";

const KEYS = [
  "NEXT_PUBLIC_BETA_PLAN_PICKER",
  "BETA_BILLING_OVERRIDE",
  "NEXT_PUBLIC_ENABLE_BETA_FEEDBACK",
] as const;

describe("beta billing flags", () => {
  const prior = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of KEYS) {
      const value = prior.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    prior.clear();
  });

  function setEnv(partial: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
    for (const key of KEYS) {
      if (!prior.has(key)) prior.set(key, process.env[key]);
      const next = partial[key];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    }
  }

  it("enables picker from explicit NEXT_PUBLIC_BETA_PLAN_PICKER", () => {
    setEnv({
      NEXT_PUBLIC_BETA_PLAN_PICKER: "true",
      BETA_BILLING_OVERRIDE: undefined,
      NEXT_PUBLIC_ENABLE_BETA_FEEDBACK: undefined,
    });
    expect(isBetaPlanPickerEnabled()).toBe(true);
    expect(isBetaBillingOverride()).toBe(true);
  });

  it("follows product beta feedback when plan flags are unset", () => {
    setEnv({
      NEXT_PUBLIC_BETA_PLAN_PICKER: undefined,
      BETA_BILLING_OVERRIDE: undefined,
      NEXT_PUBLIC_ENABLE_BETA_FEEDBACK: "true",
    });
    expect(isBetaPlanPickerEnabled()).toBe(true);
    expect(isBetaBillingOverride()).toBe(true);
  });

  it("explicit false disables even when feedback beta is on", () => {
    setEnv({
      NEXT_PUBLIC_BETA_PLAN_PICKER: "false",
      BETA_BILLING_OVERRIDE: "false",
      NEXT_PUBLIC_ENABLE_BETA_FEEDBACK: "true",
    });
    expect(isBetaPlanPickerEnabled()).toBe(false);
    expect(isBetaBillingOverride()).toBe(false);
  });

  it("exposes stable UX copy helpers", () => {
    expect(BETA_PLAN_BADGE).toContain("free to try");
    expect(betaPlanSuccessMessage("Family")).toContain("Family");
    expect(betaPlanSuccessMessage("Family")).toContain("No payment");
  });
});
