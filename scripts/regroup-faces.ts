/**
 * Rebuild people using Rekognition Face Collections (real identity matching).
 *
 * Usage:
 *   npx tsx scripts/regroup-faces.ts --userId=<id>
 *   npx tsx scripts/regroup-faces.ts --userId=<id> --identity
 */

import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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
      "Usage: npx tsx scripts/regroup-faces.ts --userId=<id> [--identity]",
    );
    process.exit(1);
  }

  const useIdentity =
    hasFlag("identity") ||
    process.env.FACE_DETECTION_ENABLED === "true";

  const { listPeopleForUser } = await import("../src/lib/people");

  if (useIdentity) {
    const { reprocessFacesWithRekognitionIdentity } = await import(
      "../src/lib/faces/identity-grouping"
    );
    console.log("[regroup-faces] using Rekognition identity matching…");
    const result = await reprocessFacesWithRekognitionIdentity(userId);
    const people = await listPeopleForUser(userId);
    console.log("[regroup-faces] complete", {
      assigned: result.assigned,
      created: result.created,
      skipped: result.skipped,
      peopleNow: people.length,
    });
    return;
  }

  const { reprocessFaceGrouping } = await import("../src/lib/faces/grouping");
  const result = await reprocessFaceGrouping(userId, {
    resetAssignments: true,
    pruneEmptyPeople: true,
  });
  const people = await listPeopleForUser(userId);
  console.log("[regroup-faces] complete (conservative, no identity)", {
    assigned: result.grouping.assigned,
    created: result.grouping.created,
    skipped: result.grouping.skipped,
    peopleNow: people.length,
  });
}

main().catch((error) => {
  console.error("[regroup-faces] failed", error);
  process.exit(1);
});
