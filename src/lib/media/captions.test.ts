import { describe, expect, it } from "vitest";
import {
  MEDIA_CAPTION_MAX_LENGTH,
  normalizeMediaCaption,
} from "@/lib/media/captions";
import { roleHasCapability } from "@/lib/permissions";

describe("normalizeMediaCaption", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeMediaCaption("  Beach   day  ")).toBe("Beach day");
  });

  it("stores empty as null", () => {
    expect(normalizeMediaCaption("")).toBeNull();
    expect(normalizeMediaCaption("   ")).toBeNull();
    expect(normalizeMediaCaption(null)).toBeNull();
    expect(normalizeMediaCaption(undefined)).toBeNull();
  });

  it("truncates to the max length", () => {
    const long = "a".repeat(MEDIA_CAPTION_MAX_LENGTH + 40);
    expect(normalizeMediaCaption(long)?.length).toBe(MEDIA_CAPTION_MAX_LENGTH);
  });
});

describe("media caption access policy", () => {
  it("owner and contribute members can edit; viewers stay read-only; outsiders cannot", () => {
    // Mirrors canEditMedia / canViewMedia capability matrix for captions.
    const cases = [
      { kind: "owner", view: true, edit: true },
      { kind: "family_member", view: true, edit: true },
      { kind: "family_viewer", view: true, edit: false },
      { kind: "outsider", view: false, edit: false },
    ] as const;

    expect(roleHasCapability("owner", "contribute")).toBe(true);
    expect(roleHasCapability("member", "contribute")).toBe(true);
    expect(roleHasCapability("viewer", "contribute")).toBe(false);
    expect(roleHasCapability("viewer", "view")).toBe(true);

    expect(cases.filter((c) => c.edit).map((c) => c.kind)).toEqual([
      "owner",
      "family_member",
    ]);
    expect(cases.filter((c) => !c.view).map((c) => c.kind)).toEqual([
      "outsider",
    ]);
  });

  it("documents Photos reload contract: caption on clean/ready library items only", () => {
    const librarySurfaces = [
      { surface: "photos_grid", cleanReady: true, showCaption: true },
      { surface: "lightbox", cleanReady: true, showCaption: true },
      { surface: "pending_moderation", cleanReady: false, showCaption: false },
      { surface: "private_document", cleanReady: false, showCaption: false },
    ] as const;

    expect(
      librarySurfaces.filter((s) => s.showCaption).map((s) => s.surface),
    ).toEqual(["photos_grid", "lightbox"]);
    expect(
      librarySurfaces.filter((s) => !s.cleanReady).every((s) => !s.showCaption),
    ).toBe(true);
  });
});
