/** Client-safe photo request copy (no DB imports). */

export const DEFAULT_PHOTO_REQUEST_MESSAGE =
  "Can you upload the wedding photos when you get a chance?";

export const PHOTO_REQUEST_PRESETS = [
  DEFAULT_PHOTO_REQUEST_MESSAGE,
  "Would you mind adding a few photos from the family gathering?",
  "Can you share the kids’ photos when you’re free?",
] as const;
