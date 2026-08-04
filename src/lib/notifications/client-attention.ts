/**
 * Soft ding for newly arrived in-app notifications (client-only).
 * Batches rapid arrivals into one play; fails quietly if autoplay is blocked.
 */

const DING_SRC = "/sounds/notification-ding.wav";
/** Prefer one ding per burst of arrivals. */
const DING_COOLDOWN_MS = 2500;
const DING_VOLUME = 0.32;

let lastDingAt = 0;
let sharedAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement | null {
  const AudioCtor =
    typeof globalThis !== "undefined"
      ? (globalThis as typeof globalThis & { Audio?: typeof Audio }).Audio
      : undefined;
  if (!AudioCtor) return null;
  if (!sharedAudio) {
    sharedAudio = new AudioCtor(DING_SRC);
    sharedAudio.preload = "auto";
    sharedAudio.volume = DING_VOLUME;
  }
  return sharedAudio;
}

/** Play once (cooldown-aware). Safe when browsers block autoplay. */
export function playNotificationDing(): void {
  const now = Date.now();
  if (now - lastDingAt < DING_COOLDOWN_MS) return;
  lastDingAt = now;

  try {
    const audio = getAudio();
    if (!audio) return;
    audio.volume = DING_VOLUME;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** Test helper — reset cooldown / shared audio between unit tests. */
export function resetNotificationDingCooldown(): void {
  lastDingAt = 0;
  sharedAudio = null;
}
