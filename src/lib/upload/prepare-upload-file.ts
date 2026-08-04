/**
 * Client-side upload prep for mobile Camera Roll quirks.
 * - Infer MIME when File.type is empty (common on iOS)
 * - Convert HEIC/HEIF → JPEG when the browser can decode them
 */

import {
  isHeicUploadType,
  maxBytesForContentType,
  resolveUploadContentType,
  type AllowedUploadType,
} from "@/lib/upload/constants";

export type PreparedUploadFile = {
  file: File;
  contentType: AllowedUploadType;
  convertedFromHeic: boolean;
};

function jpegFilename(name: string): string {
  return name.replace(/\.(heic|heif)$/i, ".jpg").replace(/\.$/, "") || "photo.jpg";
}

/**
 * Best-effort HEIC → JPEG via createImageBitmap (works on many iOS browsers).
 * Returns null when the browser cannot decode HEIC — server will try later.
 */
async function tryConvertHeicToJpeg(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  if (typeof document === "undefined") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
    });
    if (!blob || blob.size <= 0) return null;

    return new File([blob], jpegFilename(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return null;
  }
}

export function validatePreparedUpload(
  contentType: AllowedUploadType,
  size: number,
): string | null {
  const max = maxBytesForContentType(contentType);
  if (size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return `File is too large (max ${mb} MB).`;
  }
  return null;
}

/**
 * Resolve MIME + optionally convert HEIC so uploads match desktop JPEG path.
 */
export async function prepareUploadFile(file: File): Promise<
  | { ok: true; prepared: PreparedUploadFile }
  | { ok: false; error: string }
> {
  const resolved = resolveUploadContentType({
    filename: file.name,
    contentType: file.type,
  });

  if (!resolved) {
    return {
      ok: false,
      error:
        "Unsupported file type. Use JPEG, PNG, WebP, HEIC, MP4, MOV, or WebM.",
    };
  }

  const sizeError = validatePreparedUpload(resolved, file.size);
  if (sizeError) return { ok: false, error: sizeError };

  if (isHeicUploadType(resolved)) {
    const converted = await tryConvertHeicToJpeg(file);
    if (converted) {
      const convertedError = validatePreparedUpload(
        "image/jpeg",
        converted.size,
      );
      if (convertedError) return { ok: false, error: convertedError };
      return {
        ok: true,
        prepared: {
          file: converted,
          contentType: "image/jpeg",
          convertedFromHeic: true,
        },
      };
    }
  }

  // Prefer a File with an explicit type when the browser left type empty.
  const typed =
    file.type === resolved
      ? file
      : new File([file], file.name, {
          type: resolved,
          lastModified: file.lastModified,
        });

  return {
    ok: true,
    prepared: {
      file: typed,
      contentType: resolved,
      convertedFromHeic: false,
    },
  };
}
