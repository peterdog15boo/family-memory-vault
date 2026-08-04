/**
 * Client-only: resize an image file to a small JPEG data URL for Ava avatars.
 */
export async function fileToAvaAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("That photo is a bit large — try one under 8 MB.");
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
    if (!ctx) throw new Error("Could not prepare that image.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!dataUrl.startsWith("data:image/jpeg")) {
      throw new Error("Could not prepare that image.");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
