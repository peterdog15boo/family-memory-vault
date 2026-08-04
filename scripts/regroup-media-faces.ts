/**
 * Re-group faces for one media with current identity matching settings.
 *
 * Usage: npx tsx scripts/regroup-media-faces.ts --mediaId=<id>
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
  const mediaId = argValue("mediaId");
  if (!mediaId) {
    console.error("Usage: npx tsx scripts/regroup-media-faces.ts --mediaId=<id>");
    process.exit(1);
  }

  process.env.FACE_IDENTITY_MATCH_THRESHOLD =
    argValue("threshold") ?? "95";

  const { getDb } = await import("../src/lib/db");
  const { and, eq } = await import("drizzle-orm");
  const { faces, media } = await import("../src/lib/db/schema");
  const { unassignFaceFromPerson } = await import("../src/lib/people");
  const { groupFacesWithRekognitionIdentity } = await import(
    "../src/lib/faces/identity-grouping"
  );

  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  if (!row) {
    console.error("Media not found");
    process.exit(1);
  }

  const faceRows = await db
    .select()
    .from(faces)
    .where(and(eq(faces.mediaId, mediaId), eq(faces.userId, row.userId)));

  console.log("[regroup-media-faces] unassigning", {
    mediaId,
    faces: faceRows.length,
    threshold: process.env.FACE_IDENTITY_MATCH_THRESHOLD,
  });

  for (const face of faceRows) {
    if (face.personId) {
      await unassignFaceFromPerson(face.id, row.userId);
    }
  }

  const result = await groupFacesWithRekognitionIdentity(
    row.userId,
    faceRows.map((f) => f.id),
  );

  console.log("[regroup-media-faces] complete", {
    assigned: result.assigned,
    created: result.created,
    skipped: result.skipped,
    decisions: result.decisions,
  });
}

main().catch((error) => {
  console.error("[regroup-media-faces] failed", error);
  process.exit(1);
});
