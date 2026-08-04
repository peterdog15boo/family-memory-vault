import { z } from "zod";

/**
 * Preferences stored on memories.settings (JSONB).
 * Keep additive — unknown keys are preserved on merge.
 */

export const SLIDESHOW_TRANSITIONS = ["fade", "slide", "none"] as const;
export type SlideshowTransition = (typeof SLIDESHOW_TRANSITIONS)[number];

export const slideshowSettingsSchema = z.object({
  transition: z.enum(SLIDESHOW_TRANSITIONS).optional(),
  /** How long each photo stays on screen (ms). Videos play full length. */
  photoDurationMs: z.number().int().min(1500).max(30000).optional(),
  /** Reserved for a future background-music URL / asset id. */
  musicMediaId: z.string().min(1).nullable().optional(),
});

export type SlideshowSettings = z.infer<typeof slideshowSettingsSchema>;

export const memorySettingsSchema = z.object({
  slideshow: slideshowSettingsSchema.optional(),
});

export type MemorySettings = z.infer<typeof memorySettingsSchema>;

export const DEFAULT_SLIDESHOW_SETTINGS: Required<
  Pick<SlideshowSettings, "transition" | "photoDurationMs">
> & { musicMediaId: string | null } = {
  transition: "fade",
  photoDurationMs: 4500,
  musicMediaId: null,
};

export function normalizeSlideshowSettings(
  settings: MemorySettings | null | undefined,
): Required<Pick<SlideshowSettings, "transition" | "photoDurationMs">> & {
  musicMediaId: string | null;
} {
  const raw = settings?.slideshow ?? {};
  const parsed = slideshowSettingsSchema.safeParse(raw);
  const slideshow = parsed.success ? parsed.data : {};

  return {
    transition: slideshow.transition ?? DEFAULT_SLIDESHOW_SETTINGS.transition,
    photoDurationMs:
      slideshow.photoDurationMs ?? DEFAULT_SLIDESHOW_SETTINGS.photoDurationMs,
    musicMediaId:
      slideshow.musicMediaId === undefined
        ? null
        : slideshow.musicMediaId,
  };
}

/**
 * Deep-merge patch into existing settings. Only known slideshow keys are
 * validated; other top-level keys on `existing` are preserved.
 */
export function mergeMemorySettings(
  existing: MemorySettings | null | undefined,
  patch: MemorySettings,
): MemorySettings {
  const base: MemorySettings = { ...(existing ?? {}) };
  if (patch.slideshow) {
    base.slideshow = {
      ...(base.slideshow ?? {}),
      ...patch.slideshow,
    };
  }
  return base;
}
