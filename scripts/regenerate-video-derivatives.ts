/**
 * Force-regenerate video poster + ≤1080p playback proxy for one media id.
 * Usage: npx tsx scripts/regenerate-video-derivatives.ts --mediaId=<id>
 */
import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });

if (process.env.ALLOW_INSECURE_TLS === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main() {
  const mediaId = argValue("mediaId");
  if (!mediaId) {
    console.error("Usage: npx tsx scripts/regenerate-video-derivatives.ts --mediaId=<id>");
    process.exit(1);
  }

  const { generateAndStoreThumbnail } = await import(
    "../src/lib/media/thumbnails"
  );
  const { generateAndStoreVideoPlaybackProxy } = await import(
    "../src/lib/media/video-playback"
  );

  console.log("[regen] thumbnail…", mediaId);
  const thumb = await generateAndStoreThumbnail(mediaId, { force: true });
  console.log("[regen] thumbnail done", thumb);

  console.log("[regen] playback proxy…", mediaId);
  const playback = await generateAndStoreVideoPlaybackProxy(mediaId, {
    force: true,
  });
  console.log("[regen] playback done", playback);
}

main().catch((error) => {
  console.error("[regen] failed", error);
  process.exit(1);
});
