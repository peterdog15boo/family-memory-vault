import { describe, expect, it } from "vitest";
import { roleHasCapability } from "@/lib/permissions";
import { isSafeToServe, type ModerationStatus } from "@/lib/moderation/types";

describe("roleHasCapability", () => {
  it("gives owners full capabilities", () => {
    expect(roleHasCapability("owner", "view")).toBe(true);
    expect(roleHasCapability("owner", "contribute")).toBe(true);
    expect(roleHasCapability("owner", "manageMembers")).toBe(true);
    expect(roleHasCapability("owner", "deleteFamily")).toBe(true);
  });

  it("lets members view and contribute only", () => {
    expect(roleHasCapability("member", "view")).toBe(true);
    expect(roleHasCapability("member", "contribute")).toBe(true);
    expect(roleHasCapability("member", "manageMembers")).toBe(false);
    expect(roleHasCapability("member", "deleteFamily")).toBe(false);
  });

  it("restricts viewers to view", () => {
    expect(roleHasCapability("viewer", "view")).toBe(true);
    expect(roleHasCapability("viewer", "contribute")).toBe(false);
    expect(roleHasCapability("viewer", "manageMembers")).toBe(false);
    expect(roleHasCapability("viewer", "deleteFamily")).toBe(false);
  });
});

describe("isSafeToServe", () => {
  const unsafe: ModerationStatus[] = [
    "pending",
    "adult",
    "csam_quarantined",
    "rejected",
    "needs_human_review",
  ];

  it("only allows clean media", () => {
    expect(isSafeToServe("clean")).toBe(true);
    for (const status of unsafe) {
      expect(isSafeToServe(status)).toBe(false);
    }
  });
});
