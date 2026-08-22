/**
 * Browser SHA-256 for practical upload dedupe (skips huge files).
 */

import { CONTENT_HASH_CLIENT_MAX_BYTES } from "@/lib/media/import/content-hash";

export async function sha256HexFromFile(file: File): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  if (file.size <= 0 || file.size > CONTENT_HASH_CLIENT_MAX_BYTES) return null;
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (const b of bytes) {
      hex += b.toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}
