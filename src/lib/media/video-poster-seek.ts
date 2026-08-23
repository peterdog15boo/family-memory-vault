/**
 * Pick a poster seek time that avoids black/fade-in intro frames.
 * - Unknown duration → 2s (ffmpeg clamps near EOF if shorter)
 * - Short clips (< 4s) → 40% in
 * - Longer clips → midpoint (home movies often fade in at the start)
 */
export function pickVideoPosterSeekSec(durationSec: number | null): number {
  if (!Number.isFinite(durationSec) || !durationSec || durationSec <= 0) {
    return 2;
  }
  if (durationSec < 4) {
    return Math.max(0.25, durationSec * 0.4);
  }
  const mid = durationSec * 0.5;
  // Prefer mid, but never earlier than 2s on longer clips.
  return Math.min(durationSec - 0.15, Math.max(2, mid));
}
