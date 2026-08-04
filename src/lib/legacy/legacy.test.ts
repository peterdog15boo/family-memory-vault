import { describe, expect, it } from "vitest";
import {
  DIGITAL_LEGACY_SAFETY,
  LEGACY_CONTACT_CATEGORY_LABELS,
  LEGACY_INSTRUCTION_SECTION_LABELS,
  LEGACY_SECURE_ITEM_TYPE_LABELS,
  LEGACY_VIDEO_SECTION_LABELS,
  LEGACY_VIDEO_SOURCE_LABELS,
} from "@/lib/legacy/types";
import {
  LEGACY_VIDEO_ALLOWED_CONTENT_TYPES,
  assertAllowedLegacyVideoUpload,
  assertOwnedLegacyVideoStorageKey,
  buildLegacyVideoStorageKey,
  buildLegacyVideoTempKey,
  LEGACY_VIDEO_PLAYBACK_EXPIRES_IN_SECONDS,
  LEGACY_VIDEO_PLAYBACK_MAX_EXPIRES_IN_SECONDS,
  LegacyVideoStorageError,
  normalizeLegacyVideoContentType,
} from "@/lib/legacy/video-storage";
import {
  LEGACY_CONTACT_CATEGORIES,
  LEGACY_INSTRUCTION_SECTION_TYPES,
  LEGACY_SECURE_ITEM_TYPES,
  LEGACY_VIDEO_SECTION_TYPES,
  LEGACY_VIDEO_SOURCE_TYPES,
} from "@/lib/db/schema";
import { isLegacyVideoStorageKey, isPrivateVaultStorageKey } from "@/lib/r2";
import {
  LEGACY_VIDEO_PLAYBACK_MAX_TTL_SECONDS,
  LEGACY_VIDEO_PLAYBACK_TTL_SECONDS,
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS,
  PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS,
} from "@/lib/security/sensitive-access";

describe("digital legacy foundation", () => {
  it("defines contact categories", () => {
    expect([...LEGACY_CONTACT_CATEGORIES]).toEqual([
      "attorney",
      "insurance_agent",
      "accountant",
      "business_partner",
      "family",
      "executor",
      "other",
    ]);
    expect(LEGACY_CONTACT_CATEGORY_LABELS.executor).toBe("Executor");
  });

  it("defines instruction section types", () => {
    expect([...LEGACY_INSTRUCTION_SECTION_TYPES]).toEqual([
      "personal",
      "financial",
      "business_operations",
      "accounts_access",
      "legal",
      "survivors_guidance",
    ]);
    expect(LEGACY_INSTRUCTION_SECTION_LABELS.accounts_access).toMatch(
      /Accounts/,
    );
  });

  it("defines secure item types", () => {
    expect([...LEGACY_SECURE_ITEM_TYPES]).toEqual([
      "password",
      "account_info",
      "location_of_documents",
      "other",
    ]);
    expect(LEGACY_SECURE_ITEM_TYPE_LABELS.password).toBe("Password");
  });

  it("defines video section and source types", () => {
    expect([...LEGACY_VIDEO_SECTION_TYPES]).toEqual([
      "personal",
      "financial",
      "business_operations",
      "accounts_access",
      "legal",
      "survivors_guidance",
      "message_to_loved_ones",
      "custom",
    ]);
    expect([...LEGACY_VIDEO_SOURCE_TYPES]).toEqual(["recorded", "uploaded"]);
    expect(LEGACY_VIDEO_SECTION_LABELS.message_to_loved_ones).toMatch(
      /Message/,
    );
    expect(LEGACY_VIDEO_SOURCE_LABELS.recorded).toBe("Recorded");
  });

  it("documents owner-only safety rules including videos", () => {
    expect(DIGITAL_LEGACY_SAFETY.length).toBeGreaterThan(0);
    expect(
      DIGITAL_LEGACY_SAFETY.some((s) => s.toLowerCase().includes("owner-only")),
    ).toBe(true);
    expect(DIGITAL_LEGACY_SAFETY.some((s) => s.includes("legacy_videos"))).toBe(
      true,
    );
    expect(
      DIGITAL_LEGACY_SAFETY.some((s) =>
        s.toLowerCase().includes("short-lived signed"),
      ),
    ).toBe(true);
    expect(
      DIGITAL_LEGACY_SAFETY.some((s) =>
        s.includes("private-legacy-videos-temp"),
      ),
    ).toBe(true);
  });
});

describe("legacy video storage isolation", () => {
  it("builds user-scoped private keys", () => {
    const temp = buildLegacyVideoTempKey({
      userId: "user_1",
      filename: "note.mp4",
      uploadId: "up1",
    });
    expect(temp).toBe("private-legacy-videos-temp/user_1/up1.mp4");

    const webmRecording = buildLegacyVideoTempKey({
      userId: "user_1",
      filename: "recording",
      uploadId: "up2",
      contentType: "video/webm;codecs=vp9,opus",
    });
    expect(webmRecording).toBe("private-legacy-videos-temp/user_1/up2.webm");

    const permanent = buildLegacyVideoStorageKey({
      userId: "user_1",
      videoId: "vid_1",
      filename: "note.mp4",
    });
    expect(permanent).toBe("private-legacy-videos/user_1/vid_1/note.mp4");
    expect(isLegacyVideoStorageKey(permanent)).toBe(true);
    expect(isPrivateVaultStorageKey(temp)).toBe(true);
  });

  it("rejects gallery-style keys for owned storage", () => {
    expect(() =>
      assertOwnedLegacyVideoStorageKey("originals/user_1/vid/a.mp4", "user_1"),
    ).toThrow(LegacyVideoStorageError);
    expect(() =>
      assertOwnedLegacyVideoStorageKey("thumbnails/user_1/vid.jpg", "user_1"),
    ).toThrow(LegacyVideoStorageError);
  });

  it("allows browser recording and uploaded video formats", () => {
    expect([...LEGACY_VIDEO_ALLOWED_CONTENT_TYPES]).toEqual([
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska",
    ]);
    expect(
      assertAllowedLegacyVideoUpload({
        contentType: "video/webm;codecs=vp8,opus",
        sizeBytes: 1024,
      }),
    ).toBe("video/webm");
    expect(
      assertAllowedLegacyVideoUpload({
        contentType: "video/mp4",
        sizeBytes: 1024,
      }),
    ).toBe("video/mp4");
    expect(
      assertAllowedLegacyVideoUpload({
        contentType: "video/quicktime",
        sizeBytes: 1024,
        filename: "clip.mov",
      }),
    ).toBe("video/quicktime");
    expect(() =>
      assertAllowedLegacyVideoUpload({
        contentType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).toThrow(LegacyVideoStorageError);
  });

  it("normalizes content types by stripping codec parameters", () => {
    expect(
      normalizeLegacyVideoContentType("video/webm;codecs=vp9,opus"),
    ).toBe("video/webm");
  });

  it("matches private document short-lived playback TTLs", () => {
    expect(LEGACY_VIDEO_PLAYBACK_TTL_SECONDS).toBe(
      PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS,
    );
    expect(LEGACY_VIDEO_PLAYBACK_MAX_TTL_SECONDS).toBe(
      PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS,
    );
    expect(LEGACY_VIDEO_PLAYBACK_EXPIRES_IN_SECONDS).toBe(60);
    expect(LEGACY_VIDEO_PLAYBACK_MAX_EXPIRES_IN_SECONDS).toBe(120);
  });
});
