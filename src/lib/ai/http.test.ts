import { describe, expect, it } from "vitest";
import {
  buildActionButtons,
  serializeUnderstanding,
  toAssistantTurnApiPayload,
} from "@/lib/ai/http";
import type { AssistantUiResponse } from "@/lib/ai/assistant";

function previewTurn(): AssistantUiResponse {
  return {
    conversationId: "c1",
    userMessageId: "u1",
    assistantMessageId: "a1",
    status: "preview",
    message: "I found 12 photos. Create a slideshow?",
    intent: {
      action: "create_movie",
      people: ["Craig"],
      tone: "memorial",
      raw_prompt: "memorial for Craig",
      theme_preference: "cinematic",
      title_suggestion: "In Memory of Craig",
    },
    preview: {
      proposalId: "p1",
      action: "create_movie",
      title: "In Memory of Craig",
      totalCount: 12,
      mediaIds: ["m1", "m2"],
      thumbnails: [{ mediaId: "m1", previewUrl: "https://example.com/1.jpg" }],
      people: [{ id: "person1", name: "Craig" }],
      dateLabel: undefined,
      theme: "cinematic",
      requiresConfirmation: true,
    },
    entities: { mediaIds: ["m1", "m2"] },
  };
}

describe("assistant HTTP serializers", () => {
  it("builds confirm/cancel buttons for preview turns", () => {
    const buttons = buildActionButtons(previewTurn());
    expect(buttons.map((b) => b.action)).toEqual(["confirm", "cancel"]);
    expect(buttons[0]?.proposalId).toBe("p1");
  });

  it("shapes a UI-friendly turn payload", () => {
    const payload = toAssistantTurnApiPayload(previewTurn());
    expect(payload.assistantText).toMatch(/slideshow/i);
    expect(payload.understanding?.action).toBe("create_movie");
    expect(payload.understanding?.tone).toBe("memorial");
    expect(payload.mediaPreview?.totalCount).toBe(12);
    expect(payload.mediaPreview?.thumbnails).toHaveLength(1);
    expect(payload.actionButtons.length).toBeGreaterThanOrEqual(2);
    expect(payload.created.mediaIds).toEqual(["m1", "m2"]);
  });

  it("includes memory/movie links after completion", () => {
    const payload = toAssistantTurnApiPayload({
      ...previewTurn(),
      status: "completed",
      preview: undefined,
      result: {
        type: "create_movie",
        movieId: "mov1",
        memoryId: "mem1",
        title: "In Memory of Craig",
      },
      entities: { memoryId: "mem1", movieId: "mov1" },
    });

    expect(payload.actionButtons.some((b) => b.action === "view_memory")).toBe(
      true,
    );
    expect(payload.created.links.some((l) => l.href.includes("/memories/"))).toBe(
      true,
    );
    expect(payload.created.movieId).toBe("mov1");
    expect(serializeUnderstanding(undefined)).toBeNull();
  });

  it("includes person photo links after search completion", () => {
    const payload = toAssistantTurnApiPayload({
      conversationId: "c1",
      userMessageId: "u1",
      assistantMessageId: "a1",
      status: "completed",
      message: "I found 2 matching photos.",
      intent: {
        action: "search_media",
        people: ["Noah"],
        raw_prompt: "images of Noah",
      },
      preview: {
        proposalId: "search-a1",
        action: "search_media",
        totalCount: 2,
        mediaIds: ["m1", "m2"],
        thumbnails: [
          { mediaId: "m1", previewUrl: "https://example.com/1.jpg" },
          { mediaId: "m2", previewUrl: "https://example.com/2.jpg" },
        ],
        people: [{ id: "person-noah", name: "Noah" }],
        requiresConfirmation: false,
      },
      result: {
        type: "search_media",
        mediaIds: ["m1", "m2"],
        count: 2,
      },
      entities: { mediaIds: ["m1", "m2"] },
    });

    expect(payload.mediaPreview?.thumbnails).toHaveLength(2);
    expect(
      payload.actionButtons.some((b) => b.action === "create_memory_from_search"),
    ).toBe(true);
    expect(
      payload.actionButtons.some((b) => b.action === "create_movie_from_search"),
    ).toBe(true);
    expect(payload.actionButtons.some((b) => b.href === "/people/person-noah")).toBe(
      true,
    );
    expect(
      payload.actionButtons.find((b) => b.action === "create_memory_from_search")
        ?.mediaIds,
    ).toEqual(["m1", "m2"]);
  });
});
