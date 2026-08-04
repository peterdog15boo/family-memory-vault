import { afterEach, describe, expect, it, vi } from "vitest";
import {
  playNotificationDing,
  resetNotificationDingCooldown,
} from "@/lib/notifications/client-attention";

describe("playNotificationDing", () => {
  afterEach(() => {
    resetNotificationDingCooldown();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plays once and batches rapid calls into one ding", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    class MockAudio {
      volume = 1;
      currentTime = 0;
      preload = "";
      play = play;
      pause = vi.fn();
    }
    vi.stubGlobal("Audio", MockAudio);

    playNotificationDing();
    playNotificationDing();
    playNotificationDing();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("fails quietly when play() rejects (autoplay blocked)", () => {
    class MockAudio {
      volume = 1;
      currentTime = 0;
      preload = "";
      play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
      pause = vi.fn();
    }
    vi.stubGlobal("Audio", MockAudio);

    expect(() => playNotificationDing()).not.toThrow();
  });
});
