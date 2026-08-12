/**
 * Client-only: resize an image file to a small JPEG data URL for Ava avatars.
 */

export type AvaAvatarClientErrorCode =
  | "choose_image_file"
  | "photo_under_8mb"
  | "could_not_prepare";

export class AvaAvatarClientError extends Error {
  readonly code: AvaAvatarClientErrorCode;

  constructor(code: AvaAvatarClientErrorCode) {
    super(code);
    this.name = "AvaAvatarClientError";
    this.code = code;
  }
}

export function avaAvatarClientErrorKey(
  code: AvaAvatarClientErrorCode,
): string {
  switch (code) {
    case "choose_image_file":
      return "ava.errors.chooseImageFile";
    case "photo_under_8mb":
      return "ava.errors.photoUnder8Mb";
    case "could_not_prepare":
      return "ava.errors.couldNotPrepare";
  }
}

export async function fileToAvaAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new AvaAvatarClientError("choose_image_file");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new AvaAvatarClientError("photo_under_8mb");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 256;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AvaAvatarClientError("could_not_prepare");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!dataUrl.startsWith("data:image/jpeg")) {
      throw new AvaAvatarClientError("could_not_prepare");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
