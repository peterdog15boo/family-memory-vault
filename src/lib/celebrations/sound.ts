/**
 * Soft two-note chime for full celebrations.
 * Never plays unless the caller already checked the muted-by-default pref.
 */

const COOLDOWN_MS = 4000;

let lastAt = 0;

export function playCelebrationChime(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastAt < COOLDOWN_MS) return;
  lastAt = now;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.045;
    master.connect(ctx.destination);

    const notes = [523.25, 659.25];
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + index * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(1, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.24);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 700);
  } catch {
    /* autoplay / unsupported */
  }
}

export function resetCelebrationChimeCooldown(): void {
  lastAt = 0;
}
