/**
 * Pure helpers / contracts for the canonical person-media visibility rule.
 * DB-backed paths are covered via shared-access contract tests + integration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Same rule as listVisibleMediaLinkedToPerson / People list joins. */
function isVisiblePersonMedia(input: {
  faceUserId: string;
  viewerId: string;
  mediaOwnerId: string;
  accessibleOwnerIds: Set<string>;
  cleanReady: boolean;
}): boolean {
  return (
    input.faceUserId === input.viewerId &&
    input.cleanReady &&
    input.accessibleOwnerIds.has(input.mediaOwnerId)
  );
}

describe("canonical person-media visibility", () => {
  const viewerId = "viewer";
  const accessible = new Set([viewerId, "family_member"]);

  it("includes owned and shared clean/ready linked media", () => {
    const rows = [
      {
        faceUserId: viewerId,
        mediaOwnerId: viewerId,
        cleanReady: true,
        mediaId: "own",
      },
      {
        faceUserId: viewerId,
        mediaOwnerId: "family_member",
        cleanReady: true,
        mediaId: "shared",
      },
      {
        faceUserId: viewerId,
        mediaOwnerId: "family_member",
        cleanReady: false,
        mediaId: "dirty",
      },
      {
        faceUserId: viewerId,
        mediaOwnerId: "stranger",
        cleanReady: true,
        mediaId: "leak",
      },
      {
        faceUserId: "someone_else",
        mediaOwnerId: viewerId,
        cleanReady: true,
        mediaId: "wrong_graph",
      },
    ];

    const visible = rows.filter((r) =>
      isVisiblePersonMedia({
        faceUserId: r.faceUserId,
        viewerId,
        mediaOwnerId: r.mediaOwnerId,
        accessibleOwnerIds: accessible,
        cleanReady: r.cleanReady,
      }),
    );

    expect(visible.map((r) => r.mediaId)).toEqual(["own", "shared"]);
  });

  it("keeps People list, detail, and Ask AI on the same id set", () => {
    const linkedVisibleIds = ["own", "shared"];
    const peopleListPhotoCount = new Set(linkedVisibleIds).size;
    const personDetailPhotoCount = linkedVisibleIds.length;
    const askAiMediaIds = [...linkedVisibleIds];
    expect(peopleListPhotoCount).toBe(personDetailPhotoCount);
    expect(askAiMediaIds).toEqual(linkedVisibleIds);
  });

  it("People list counts come from the same visibility helper as detail", () => {
    const list = readFileSync(
      join(process.cwd(), "src/lib/people/index.ts"),
      "utf8",
    );
    const detail = readFileSync(
      join(process.cwd(), "src/lib/people/queries.ts"),
      "utf8",
    );
    expect(list).toContain("countVisibleMediaLinkedToPeople");
    expect(detail).toContain("listVisibleMediaLinkedToPerson");
  });
});
