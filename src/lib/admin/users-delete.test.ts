import { describe, expect, it } from "vitest";
import { matchesAdminUserDeleteConfirmation } from "@/lib/admin/users";

describe("matchesAdminUserDeleteConfirmation", () => {
  it("accepts exact email case-insensitively", () => {
    expect(
      matchesAdminUserDeleteConfirmation("Test@Example.com", "test@example.com"),
    ).toBe(true);
  });

  it("accepts DELETE", () => {
    expect(matchesAdminUserDeleteConfirmation("a@b.com", "DELETE")).toBe(true);
    expect(matchesAdminUserDeleteConfirmation("a@b.com", "delete")).toBe(true);
  });

  it("rejects empty or wrong values", () => {
    expect(matchesAdminUserDeleteConfirmation("a@b.com", "")).toBe(false);
    expect(matchesAdminUserDeleteConfirmation("a@b.com", "a@b.co")).toBe(false);
    expect(matchesAdminUserDeleteConfirmation("a@b.com", "REMOVE")).toBe(false);
  });
});
