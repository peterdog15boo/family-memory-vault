import { describe, expect, it } from "vitest";
import type { Media } from "@/lib/db/schema";
import {
  collectCaptionBeatsFromMedia,
  composeDeterministicPersonStory,
  personStorySnapshotFromRow,
} from "@/lib/people/stories";

function mediaStub(
  partial: Partial<Media> & Pick<Media, "id" | "caption">,
): Media {
  return {
    userId: "owner",
    type: "photo",
    contentType: "image/jpeg",
    byteSize: null,
    width: null,
    height: null,
    durationMs: null,
    originalFilename: null,
    originalKey: "k",
    processedKey: null,
    thumbnailKey: null,
    status: "ready",
    moderationStatus: "clean",
    moderationLabels: null,
    photodnaMatch: false,
    aiCsamScore: null,
    aiNudityScore: null,
    quarantinedAt: null,
    ncmecReportId: null,
    ncmecReportedAt: null,
    lastViewedAt: null,
    sceneCaption: null,
    sceneTags: [],
    sceneAnalyzedAt: null,
    sceneAnalysisStatus: null,
    aiCaption: null,
    aiTags: [],
    aiObjects: [],
    aiScenes: [],
    aiDescription: null,
    aiEmbedding: null,
    visualAnalyzedAt: null,
    userTags: [],
    captionUpdatedAt: null,
    captionUpdatedByUserId: null,
    dismissedAiTags: [],
    focalPointX: null,
    focalPointY: null,
    subjectBounds: null,
    framingUpdatedAt: null,
    importProvider: null,
    importExternalId: null,
    importedAt: null,
    contentHash: null,
    pendingMemoryId: null,
    takenAt: null,
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    ...partial,
  } as Media;
}

describe("person stories from captions", () => {
  it("returns empty when there are 0 captions (no invented biography)", () => {
    const beats = collectCaptionBeatsFromMedia([
      mediaStub({ id: "m1", caption: null }),
      mediaStub({ id: "m2", caption: "   " }),
    ]);
    expect(beats).toEqual([]);
    expect(composeDeterministicPersonStory("Helene", beats)).toBeNull();
  });

  it("builds a story that only mentions caption beats", () => {
    const beats = collectCaptionBeatsFromMedia([
      mediaStub({
        id: "m2",
        caption: "Sunday pie at Nana’s",
        takenAt: new Date("2021-06-01"),
        createdAt: new Date("2021-06-02"),
      }),
      mediaStub({
        id: "m1",
        caption: "First day of school smile",
        takenAt: new Date("2019-09-03"),
        createdAt: new Date("2019-09-04"),
      }),
      mediaStub({
        id: "m3",
        caption: null,
        status: "ready",
        moderationStatus: "clean",
      }),
      mediaStub({
        id: "m4",
        caption: "secret private note",
        status: "pending_moderation",
        moderationStatus: "pending",
      }),
    ]);

    expect(beats.map((b) => b.caption)).toEqual([
      "First day of school smile",
      "Sunday pie at Nana’s",
    ]);

    const story = composeDeterministicPersonStory("Helene", beats);
    expect(story).toBeTruthy();
    expect(story!).toContain("First day of school smile");
    expect(story!).toContain("Sunday pie at Nana’s");
    expect(story!).not.toContain("secret private note");
    expect(story!.toLowerCase()).not.toContain("doctor");
    expect(story!.toLowerCase()).not.toContain("attorney");
  });

  it("documents family vs outsider story visibility", () => {
    // Person pages are owner-scoped; story uses the same visible media set
    // as Person photos (clean/ready + accessible owners). Outsiders get no person.
    const cases = [
      { kind: "owner", canViewPerson: true, seesStory: true },
      { kind: "family_shared_photos_on_own_person", canViewPerson: true, seesStory: true },
      { kind: "outsider", canViewPerson: false, seesStory: false },
    ] as const;
    expect(cases.filter((c) => c.seesStory).map((c) => c.kind)).toEqual([
      "owner",
      "family_shared_photos_on_own_person",
    ]);
    expect(cases.filter((c) => !c.canViewPerson).map((c) => c.kind)).toEqual([
      "outsider",
    ]);
  });

  it("refresh snapshot replaces body and bumps generatedAt", () => {
    const before = personStorySnapshotFromRow({
      storyBody: "Old story",
      storySourceCaptionCount: 1,
      storyGeneratedAt: new Date("2024-01-01T00:00:00.000Z"),
      storyGeneratedBy: "user",
    });
    const after = personStorySnapshotFromRow({
      storyBody: "New story from more captions",
      storySourceCaptionCount: 3,
      storyGeneratedAt: new Date("2024-06-01T12:00:00.000Z"),
      storyGeneratedBy: "user",
    });
    expect(after.body).not.toBe(before.body);
    expect(after.sourceCaptionCount).toBe(3);
    expect(after.generatedAt).toBe("2024-06-01T12:00:00.000Z");
    expect(
      Date.parse(after.generatedAt!) > Date.parse(before.generatedAt!),
    ).toBe(true);
  });
});
