/**
 * Lightweight helpers for Ava’s first setup steps (name + avatar).
 */

export const AVA_SCREEN_NAME_MIN = 2;
export const AVA_SCREEN_NAME_MAX = 40;

export type AvaScreenNameErrorCode =
  | "too_short"
  | "too_long"
  | "url_not_allowed"
  | "invalid_chars";

export type AvaAvatarErrorCode = "choose_image_type" | "photo_too_large";

/** Friendly preset avatars (static assets under /public/avatars). */
export const AVA_AVATAR_PRESETS = [
  {
    id: "sun",
    labelKey: "ava.presets.sun",
    url: "/avatars/preset-sun.svg",
  },
  {
    id: "leaf",
    labelKey: "ava.presets.leaf",
    url: "/avatars/preset-leaf.svg",
  },
  {
    id: "heart",
    labelKey: "ava.presets.heart",
    url: "/avatars/preset-heart.svg",
  },
  {
    id: "star",
    labelKey: "ava.presets.star",
    url: "/avatars/preset-star.svg",
  },
  {
    id: "wave",
    labelKey: "ava.presets.wave",
    url: "/avatars/preset-wave.svg",
  },
  {
    id: "bloom",
    labelKey: "ava.presets.bloom",
    url: "/avatars/preset-bloom.svg",
  },
] as const;

export type AvaAvatarPresetId = (typeof AVA_AVATAR_PRESETS)[number]["id"];

const SCREEN_NAME_PATTERN = /^[\p{L}\p{M}\p{N}]+(?:[ '\-.][\p{L}\p{M}\p{N}]+)*$/u;

const SCREEN_NAME_ERROR_EN: Record<AvaScreenNameErrorCode, string> = {
  too_short: `Use at least ${AVA_SCREEN_NAME_MIN} characters.`,
  too_long: `Keep it under ${AVA_SCREEN_NAME_MAX} characters.`,
  url_not_allowed: "Please use a name, not a web address.",
  invalid_chars:
    "Use letters, numbers, spaces, or a simple hyphen/apostrophe.",
};

const AVATAR_ERROR_EN: Record<AvaAvatarErrorCode, string> = {
  choose_image_type: "Please choose a JPG, PNG, or WebP image.",
  photo_too_large: "That photo is a bit large — try a smaller one.",
};

export function validateAvaScreenName(raw: string): {
  ok: true;
  value: string;
} | { ok: false; code: AvaScreenNameErrorCode; error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < AVA_SCREEN_NAME_MIN) {
    return {
      ok: false,
      code: "too_short",
      error: SCREEN_NAME_ERROR_EN.too_short,
    };
  }
  if (value.length > AVA_SCREEN_NAME_MAX) {
    return {
      ok: false,
      code: "too_long",
      error: SCREEN_NAME_ERROR_EN.too_long,
    };
  }
  if (/https?:\/\//i.test(value) || /www\./i.test(value)) {
    return {
      ok: false,
      code: "url_not_allowed",
      error: SCREEN_NAME_ERROR_EN.url_not_allowed,
    };
  }
  if (!SCREEN_NAME_PATTERN.test(value)) {
    return {
      ok: false,
      code: "invalid_chars",
      error: SCREEN_NAME_ERROR_EN.invalid_chars,
    };
  }
  return { ok: true, value };
}

export function isAvaAvatarPresetUrl(url: string): boolean {
  return AVA_AVATAR_PRESETS.some((p) => p.url === url);
}

/** Small JPEG/PNG/WebP data URLs for profile avatars (client-resized). */
export function validateAvaAvatarDataUrl(raw: string): {
  ok: true;
  value: string;
} | { ok: false; code: AvaAvatarErrorCode; error: string } {
  const value = raw.trim();
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    value,
  );
  if (!match) {
    return {
      ok: false,
      code: "choose_image_type",
      error: AVATAR_ERROR_EN.choose_image_type,
    };
  }
  const b64 = match[2] ?? "";
  // ~120KB binary ceiling (base64 is ~4/3)
  if (b64.length > 160_000) {
    return {
      ok: false,
      code: "photo_too_large",
      error: AVATAR_ERROR_EN.photo_too_large,
    };
  }
  return { ok: true, value };
}

export function resolveAvaAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (isAvaAvatarPresetUrl(url)) return url;
  if (url.startsWith("data:image/")) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return null;
}

export function avaScreenNameErrorKey(
  code: AvaScreenNameErrorCode,
): string {
  switch (code) {
    case "too_short":
      return "ava.errors.tooShort";
    case "too_long":
      return "ava.errors.tooLong";
    case "url_not_allowed":
      return "ava.errors.urlNotAllowed";
    case "invalid_chars":
      return "ava.errors.invalidChars";
  }
}

export function avaAvatarErrorKey(code: AvaAvatarErrorCode): string {
  switch (code) {
    case "choose_image_type":
      return "ava.errors.chooseImageType";
    case "photo_too_large":
      return "ava.errors.photoTooLarge";
  }
}
