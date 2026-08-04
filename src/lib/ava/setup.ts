/**
 * Lightweight helpers for Ava’s first setup steps (name + avatar).
 */

export const AVA_SCREEN_NAME_MIN = 2;
export const AVA_SCREEN_NAME_MAX = 40;

/** Friendly preset avatars (static assets under /public/avatars). */
export const AVA_AVATAR_PRESETS = [
  {
    id: "sun",
    label: "Sunny",
    url: "/avatars/preset-sun.svg",
  },
  {
    id: "leaf",
    label: "Leaf",
    url: "/avatars/preset-leaf.svg",
  },
  {
    id: "heart",
    label: "Heart",
    url: "/avatars/preset-heart.svg",
  },
  {
    id: "star",
    label: "Star",
    url: "/avatars/preset-star.svg",
  },
  {
    id: "wave",
    label: "Wave",
    url: "/avatars/preset-wave.svg",
  },
  {
    id: "bloom",
    label: "Bloom",
    url: "/avatars/preset-bloom.svg",
  },
] as const;

export type AvaAvatarPresetId = (typeof AVA_AVATAR_PRESETS)[number]["id"];

const SCREEN_NAME_PATTERN = /^[\p{L}\p{M}\p{N}]+(?:[ '\-.][\p{L}\p{M}\p{N}]+)*$/u;

export function validateAvaScreenName(raw: string): {
  ok: true;
  value: string;
} | { ok: false; error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < AVA_SCREEN_NAME_MIN) {
    return {
      ok: false,
      error: `Use at least ${AVA_SCREEN_NAME_MIN} characters.`,
    };
  }
  if (value.length > AVA_SCREEN_NAME_MAX) {
    return {
      ok: false,
      error: `Keep it under ${AVA_SCREEN_NAME_MAX} characters.`,
    };
  }
  if (/https?:\/\//i.test(value) || /www\./i.test(value)) {
    return { ok: false, error: "Please use a name, not a web address." };
  }
  if (!SCREEN_NAME_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Use letters, numbers, spaces, or a simple hyphen/apostrophe.",
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
} | { ok: false; error: string } {
  const value = raw.trim();
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    value,
  );
  if (!match) {
    return { ok: false, error: "Please choose a JPG, PNG, or WebP image." };
  }
  const b64 = match[2] ?? "";
  // ~120KB binary ceiling (base64 is ~4/3)
  if (b64.length > 160_000) {
    return { ok: false, error: "That photo is a bit large — try a smaller one." };
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
