import { describe, expect, it } from "vitest";
import { createTranslator } from "@/lib/i18n";
import {
  HOME_TILE_ASSETS,
  firstReadyPhotoPreview,
} from "@/lib/dashboard/home-tiles";

describe("home tile assets", () => {
  it("uses local curated paths for every brand tile", () => {
    expect(HOME_TILE_ASSETS.photos.src).toBe("/home-tiles/photos.jpg");
    expect(HOME_TILE_ASSETS.memories.src).toBe("/home-tiles/memories.jpg");
    expect(HOME_TILE_ASSETS.shared.src).toBe("/home-tiles/shared.jpg");
    expect(HOME_TILE_ASSETS.people.src).toBe("/home-tiles/people.jpg");
    for (const tile of Object.values(HOME_TILE_ASSETS)) {
      expect(tile.src.startsWith("/home-tiles/")).toBe(true);
      expect(tile.src).not.toMatch(/unsplash|http/i);
    }
  });

  it("resolves tile copy through en-US (never raw keys)", () => {
    const t = createTranslator("en-US");
    expect(t("dashboard.tileAria", { title: "Photos", subtitle: "Your library" })).toBe(
      "Photos, Your library",
    );
    expect(t("dashboard.tileSharedTitle")).toBe("Shared with me");
    expect(t(HOME_TILE_ASSETS.photos.altKey)).toContain("family photos");
    expect(t("dashboard.tilePhotosSubtitle")).not.toMatch(/^dashboard\./);
  });
});

describe("firstReadyPhotoPreview", () => {
  it("uses only clean/ready photo previews", () => {
    expect(
      firstReadyPhotoPreview([
        { type: "video", previewUrl: "https://cdn.example/video.jpg" },
        { type: "photo", previewUrl: "https://cdn.example/photo.jpg" },
      ]),
    ).toBe("https://cdn.example/photo.jpg");
  });

  it("returns null when no clean photo preview exists", () => {
    expect(
      firstReadyPhotoPreview([
        { type: "photo", previewUrl: null },
        { type: "video", previewUrl: "https://cdn.example/video.jpg" },
      ]),
    ).toBeNull();
  });
});
