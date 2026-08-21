/**
 * Client-side export-package (zip) helpers for Facebook / Instagram / TikTok /
 * Google Takeout downloads. Extracts media only — no scraping.
 */

import { unzipSync } from "fflate";
import { resolveUploadContentType } from "@/lib/upload/constants";
import type { MediaImportProvider } from "@/lib/media/import/types";

export const MAX_EXPORT_ZIP_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_EXPORT_MEDIA_FILES = 75;
export const MAX_EXPORT_SINGLE_FILE_BYTES = 100 * 1024 * 1024;

const MEDIA_EXT =
  /\.(jpe?g|png|webp|heic|heif|mp4|m4v|mov|webm)$/i;

const SKIP_PATH =
  /(^|\/)(__MACOSX|\.DS_Store|thumbs\.db|desktop\.ini)(\/|$)/i;

export type ExtractedExportMedia = {
  file: File;
  path: string;
  detectedProvider: MediaImportProvider;
};

export type ExportZipExtractResult =
  | {
      ok: true;
      files: ExtractedExportMedia[];
      skipped: number;
      detectedProvider: MediaImportProvider;
      archiveName: string;
    }
  | { ok: false; error: string };

function detectProviderFromPaths(
  paths: string[],
  archiveName: string,
): MediaImportProvider {
  const blob = `${archiveName}\n${paths.slice(0, 80).join("\n")}`.toLowerCase();
  if (blob.includes("instagram")) return "instagram";
  if (blob.includes("facebook") || blob.includes("your_facebook")) {
    return "facebook";
  }
  if (blob.includes("tiktok") || blob.includes("tik_tok")) {
    return "tiktok";
  }
  if (
    blob.includes("takeout") ||
    blob.includes("google photos") ||
    blob.includes("google_photos")
  ) {
    return "google_takeout";
  }
  return "export_package";
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Unzip a Takeout / social export archive and return uploadable media Files.
 */
export async function extractMediaFromExportZip(
  zipFile: File,
): Promise<ExportZipExtractResult> {
  if (!zipFile.name.toLowerCase().endsWith(".zip")) {
    return { ok: false, error: "Please choose a .zip export package." };
  }
  if (zipFile.size <= 0) {
    return { ok: false, error: "That zip file is empty." };
  }
  if (zipFile.size > MAX_EXPORT_ZIP_BYTES) {
    return {
      ok: false,
      error: `Zip is too large (max ${Math.round(MAX_EXPORT_ZIP_BYTES / (1024 * 1024))} MB). Split your export or upload fewer albums.`,
    };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    const buf = new Uint8Array(await zipFile.arrayBuffer());
    unzipped = unzipSync(buf, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        if (SKIP_PATH.test(file.name)) return false;
        return MEDIA_EXT.test(file.name);
      },
    });
  } catch {
    return {
      ok: false,
      error:
        "Could not read that zip. Re-download the official export package and try again.",
    };
  }

  const paths = Object.keys(unzipped);
  if (paths.length === 0) {
    return {
      ok: false,
      error:
        "No photos or videos found in that zip. Use an official Facebook, Instagram, TikTok, or Google Takeout media export.",
    };
  }

  const detectedProvider = detectProviderFromPaths(paths, zipFile.name);
  const files: ExtractedExportMedia[] = [];
  let skipped = 0;

  for (const path of paths) {
    if (files.length >= MAX_EXPORT_MEDIA_FILES) {
      skipped += 1;
      continue;
    }
    const bytes = unzipped[path];
    if (!bytes || bytes.byteLength === 0) {
      skipped += 1;
      continue;
    }
    if (bytes.byteLength > MAX_EXPORT_SINGLE_FILE_BYTES) {
      skipped += 1;
      continue;
    }

    const name = basename(path);
    const contentType =
      resolveUploadContentType({ filename: name, contentType: "" }) ?? null;
    if (!contentType) {
      skipped += 1;
      continue;
    }

    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const file = new File([copy], name, { type: contentType });
    files.push({ file, path, detectedProvider });
  }

  if (files.length === 0) {
    return {
      ok: false,
      error:
        "No supported media files could be imported from that package (JPEG, PNG, WebP, HEIC, MP4, MOV, WebM).",
    };
  }

  return {
    ok: true,
    files,
    skipped,
    detectedProvider,
    archiveName: zipFile.name,
  };
}
