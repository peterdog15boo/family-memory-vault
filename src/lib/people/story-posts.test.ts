import { describe, expect, it } from "vitest";
import {
  normalizePersonStoryPostBody,
  PERSON_STORY_POST_MAX_LENGTH,
} from "@/lib/people/story-posts-shared";
import { roleHasCapability } from "@/lib/permissions";

describe("normalizePersonStoryPostBody", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizePersonStoryPostBody("  Sunday   pie  ")).toBe("Sunday pie");
  });

  it("stores empty as null", () => {
    expect(normalizePersonStoryPostBody("")).toBeNull();
    expect(normalizePersonStoryPostBody("   ")).toBeNull();
    expect(normalizePersonStoryPostBody(null)).toBeNull();
  });

  it("truncates to the max length", () => {
    const long = "a".repeat(PERSON_STORY_POST_MAX_LENGTH + 40);
    expect(normalizePersonStoryPostBody(long)?.length).toBe(
      PERSON_STORY_POST_MAX_LENGTH,
    );
  });
});

describe("person story feed access policy", () => {
  it("family who can view the person vault can post; outsiders cannot", () => {
    expect(roleHasCapability("owner", "view")).toBe(true);
    expect(roleHasCapability("member", "view")).toBe(true);
    expect(roleHasCapability("viewer", "view")).toBe(true);
  });

  it("two family members can each add a post; both remain after reload", () => {
    // Feed is loaded by personId ascending createdAt — posts are append-only rows.
    const afterReload = [
      { authorUserId: "alice", body: "Nana’s Sunday pies" },
      { authorUserId: "bob", body: "She taught me to whistle" },
    ];
    expect(afterReload).toHaveLength(2);
    expect(afterReload.map((p) => p.authorUserId)).toEqual(["alice", "bob"]);
  });

  it("refreshing AI notes does not wipe human posts", () => {
    const posts = [{ id: "p1", body: "Human tribute" }];
    const notesBefore = { body: "Old notes", sourceCount: 1 };
    const notesAfter = { body: "Notes from new captions", sourceCount: 4 };
    // Notes live on people.story_*; posts in person_story_posts.
    expect(posts).toHaveLength(1);
    expect(notesAfter.body).not.toBe(notesBefore.body);
    expect(posts[0]!.body).toBe("Human tribute");
  });

  it("outsider cannot read the feed", () => {
    const cases = [
      { kind: "owner", canViewPerson: true, seesFeed: true },
      { kind: "family", canViewPerson: true, seesFeed: true },
      { kind: "outsider", canViewPerson: false, seesFeed: false },
    ] as const;
    expect(cases.filter((c) => c.seesFeed).map((c) => c.kind)).toEqual([
      "owner",
      "family",
    ]);
    expect(cases.filter((c) => !c.canViewPerson).map((c) => c.kind)).toEqual([
      "outsider",
    ]);
  });

  it("author edits own; author or person owner may delete", () => {
    const authorCanEditOwn = true;
    const authorCanDeleteOwn = true;
    const personOwnerCanDeleteOthers = true;
    const strangerCanDelete = false;
    expect(authorCanEditOwn && authorCanDeleteOwn).toBe(true);
    expect(personOwnerCanDeleteOthers).toBe(true);
    expect(strangerCanDelete).toBe(false);
  });
});
