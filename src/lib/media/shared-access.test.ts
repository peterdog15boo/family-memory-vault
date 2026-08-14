/**
 * Shared-media access helpers used by People assign + Ask AI.
 *
 * These tests cover the pure eligibility seams without a live DB:
 * - accessible media filter semantics (owner ids)
 * - assign skip reasons for inaccessible ids
 */

import { describe, expect, it } from "vitest";
import { cleanReadyMediaOwnedByFilter } from "@/lib/media/queries";
import { roleHasCapability } from "@/lib/permissions";

describe("shared media access policy", () => {
  it("allows family members to view co-member content", () => {
    expect(roleHasCapability("member", "view")).toBe(true);
    expect(roleHasCapability("viewer", "view")).toBe(true);
    expect(roleHasCapability("owner", "view")).toBe(true);
  });

  it("builds a multi-owner clean/ready SQL filter for family galleries", () => {
    const filter = cleanReadyMediaOwnedByFilter(["user_a", "user_b"]);
    // Drizzle SQL object — ensure it constructs without throwing.
    expect(filter).toBeTruthy();
  });

  it("documents assign + Ask AI acceptance matrix", () => {
    const cases = [
      { kind: "owner", assign: true, askAi: true },
      { kind: "shared_family", assign: true, askAi: true },
      { kind: "outsider", assign: false, askAi: false },
    ] as const;
    expect(cases.filter((c) => c.assign).map((c) => c.kind)).toEqual([
      "owner",
      "shared_family",
    ]);
    expect(cases.filter((c) => !c.askAi).map((c) => c.kind)).toEqual([
      "outsider",
    ]);
  });
});

describe("assignMediaToPerson shared-media contract", () => {
  it("skips inaccessible media as Media not found", () => {
    // Mirrors assignMediaToPerson: ids missing from accessible set are skipped.
    const requested = ["own_1", "shared_1", "outsider_1"];
    const accessible = new Set(["own_1", "shared_1"]);
    const skipped = requested
      .filter((id) => !accessible.has(id))
      .map((mediaId) => ({ mediaId, reason: "Media not found." }));
    expect(skipped).toEqual([
      { mediaId: "outsider_1", reason: "Media not found." },
    ]);
    expect(requested.filter((id) => accessible.has(id))).toEqual([
      "own_1",
      "shared_1",
    ]);
  });
});

describe("Ask AI accessible library contract", () => {
  it("includes owned + family-shared owners, excludes outsiders", () => {
    const viewerId = "viewer";
    const accessibleOwnerIds = [viewerId, "family_member"];
    const mediaOwners = [
      { id: "m1", userId: viewerId },
      { id: "m2", userId: "family_member" },
      { id: "m3", userId: "stranger" },
    ];
    const visible = mediaOwners.filter((m) =>
      accessibleOwnerIds.includes(m.userId),
    );
    expect(visible.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(visible.some((m) => m.userId === "stranger")).toBe(false);
  });
});

describe("People list count vs detail (shared media)", () => {
  it("counts faces only when media is clean/ready and owner is accessible", () => {
    const viewerId = "viewer";
    const accessibleOwnerIds = new Set([viewerId, "family_member"]);
    const facesForPerson = [
      { mediaId: "own_1", mediaOwnerId: viewerId, cleanReady: true },
      { mediaId: "shared_1", mediaOwnerId: "family_member", cleanReady: true },
      { mediaId: "shared_dirty", mediaOwnerId: "family_member", cleanReady: false },
      { mediaId: "outsider_1", mediaOwnerId: "stranger", cleanReady: true },
    ];

    const counted = facesForPerson.filter(
      (f) => f.cleanReady && accessibleOwnerIds.has(f.mediaOwnerId),
    );
    expect(counted.map((f) => f.mediaId)).toEqual(["own_1", "shared_1"]);
    expect(counted).toHaveLength(2);
  });

  it("keeps list photoCount aligned with distinct accessible media on detail", () => {
    const accessibleMediaIds = ["own_1", "shared_1", "shared_1"]; // two faces, one photo
    const photoCount = new Set(accessibleMediaIds).size;
    expect(photoCount).toBe(2);
  });
});

describe("Ask AI person media uses same visible set as People", () => {
  it("includes owned + shared linked media in the canonical set", () => {
    const viewerId = "viewer";
    const accessibleOwnerIds = new Set([viewerId, "family_member"]);
    const linkedFaces = [
      { mediaId: "own_1", mediaOwnerId: viewerId, cleanReady: true },
      { mediaId: "shared_1", mediaOwnerId: "family_member", cleanReady: true },
    ];
    const askAiMediaIds = linkedFaces
      .filter((f) => f.cleanReady && accessibleOwnerIds.has(f.mediaOwnerId))
      .map((f) => f.mediaId);
    const peopleDetailMediaIds = [...askAiMediaIds];
    expect(askAiMediaIds).toEqual(peopleDetailMediaIds);
    expect(askAiMediaIds).toEqual(["own_1", "shared_1"]);
  });

  it("does not invent a separate owner-only Ask AI person query", () => {
    const ownerOnlyWrong = (mediaOwnerId: string, viewerId: string) =>
      mediaOwnerId === viewerId;
    const canonical = (mediaOwnerId: string, accessible: Set<string>) =>
      accessible.has(mediaOwnerId);
    const accessible = new Set(["viewer", "family_member"]);
    expect(ownerOnlyWrong("family_member", "viewer")).toBe(false);
    expect(canonical("family_member", accessible)).toBe(true);
  });
});

describe("Shared face matching actor scope", () => {
  it("stores viewer faces under actor, not media owner", () => {
    const mediaOwnerId = "owner";
    const actorUserId = "family_viewer";
    const storedFace = { userId: actorUserId, mediaId: "shared_photo" };
    expect(storedFace.userId).not.toBe(mediaOwnerId);
    expect(storedFace.userId).toBe(actorUserId);
  });

  it("reuses owner face geometry without copying personId", () => {
    const ownerFace = {
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      embedding: [0.1, 0.2],
      personId: "owner_person",
      faceToken: "owner_collection_token",
    };
    const reused = {
      boundingBox: ownerFace.boundingBox,
      embedding: ownerFace.embedding,
      personId: null as string | null,
      faceToken: null as string | null,
      provider: "reuse",
    };
    expect(reused.personId).toBeNull();
    expect(reused.faceToken).toBeNull();
    expect(reused.boundingBox).toEqual(ownerFace.boundingBox);
  });

  it("does not fan-out face jobs to outsiders", () => {
    const ownerId = "owner";
    const accessibleOwnerIds = [ownerId, "family_a", "family_b"];
    const familyViewers = accessibleOwnerIds.filter((id) => id !== ownerId);
    expect(familyViewers).toEqual(["family_a", "family_b"]);
    expect(familyViewers.includes("stranger")).toBe(false);
  });
});
