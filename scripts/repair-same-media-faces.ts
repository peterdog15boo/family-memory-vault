/**
 * Fix faces incorrectly assigned to the same person within one photo.
 *
 * Usage: npx tsx scripts/repair-same-media-faces.ts --userId=<id>
 */

import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const userId = argValue("userId");
  if (!userId) {
    console.error(
      "Usage: npx tsx scripts/repair-same-media-faces.ts --userId=<id>",
    );
    process.exit(1);
  }

  // Prefer a safer threshold for repairs unless explicitly overridden.
  if (!argValue("threshold")) {
    process.env.FACE_IDENTITY_MATCH_THRESHOLD = "85";
  } else {
    process.env.FACE_IDENTITY_MATCH_THRESHOLD = argValue("threshold")!;
  }

  const { repairSameMediaPersonCollisions } = await import(
    "../src/lib/faces/identity-grouping"
  );

  const result = await repairSameMediaPersonCollisions(userId);
  console.log("[repair-same-media-faces] complete", {
    freed: result.freed,
    assigned: result.grouping?.assigned ?? 0,
    created: result.grouping?.created ?? 0,
    skipped: result.grouping?.skipped ?? 0,
    decisions: result.grouping?.decisions ?? [],
  });
}

main().catch((error) => {
  console.error("[repair-same-media-faces] failed", error);
  process.exit(1);
});
