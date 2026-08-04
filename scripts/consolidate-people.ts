/**
 * Merge people whose indexed faces match (SearchFaces consolidate pass).
 *
 * Usage: npx tsx scripts/consolidate-people.ts --userId=<id>
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
    console.error("Usage: npx tsx scripts/consolidate-people.ts --userId=<id>");
    process.exit(1);
  }

  const { consolidatePeopleWithRekognitionIdentity } = await import(
    "../src/lib/faces/identity-grouping"
  );
  const { listPeopleForUser } = await import("../src/lib/people");

  const before = await listPeopleForUser(userId);
  const result = await consolidatePeopleWithRekognitionIdentity(userId);
  const after = await listPeopleForUser(userId);

  console.log("[consolidate-people] complete", {
    merges: result.merges,
    peopleBefore: before.length,
    peopleAfter: after.length,
  });
}

main().catch((error) => {
  console.error("[consolidate-people] failed", error);
  process.exit(1);
});
