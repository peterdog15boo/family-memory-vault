/**
 * Move media blocked by scanner/job failure into the human review queue.
 * Does not touch CSAM quarantine, clean/ready photos, or real policy rejects.
 *
 *   npx tsx scripts/repair-processing-failed-review.ts
 */
import { config } from "dotenv";
import { and, eq, inArray, or, sql } from "drizzle-orm";

config({ path: ".env.local", override: true });
config({ override: true });

async function main() {
  const { getDb } = await import("../src/lib/db");
  const { media, processingJobs } = await import("../src/lib/db/schema");
  const { updateMediaModerationStatus } = await import(
    "../src/lib/moderation/db"
  );
  const { hasProcessingFailedLabel } = await import(
    "../src/lib/moderation/processing-failed"
  );

  const db = getDb();

  const failedModerationJobs = await db
    .select({ mediaId: processingJobs.mediaId })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.type, "moderation"),
        eq(processingJobs.status, "failed"),
      ),
    );

  const failedMediaIds = [
    ...new Set(
      failedModerationJobs
        .map((row) => row.mediaId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const labeled = await db
    .select()
    .from(media)
    .where(
      or(
        sql`${media.moderationLabels}::text ILIKE '%processing_failed%'`,
        sql`${media.moderationLabels}::text ILIKE '%Processing failed after%'`,
        failedMediaIds.length > 0
          ? inArray(media.id, failedMediaIds)
          : sql`false`,
      ),
    );

  const toRepair = labeled.filter((row) => {
    if (
      row.moderationStatus === "csam_quarantined" ||
      row.status === "csam_quarantined" ||
      row.moderationStatus === "clean"
    ) {
      return false;
    }
    const labeledFail = hasProcessingFailedLabel(row.moderationLabels);
    const labelsText = JSON.stringify(row.moderationLabels ?? {});
    const textFail = /processing_failed|Processing failed after/i.test(
      labelsText,
    );
    const jobFail = failedMediaIds.includes(row.id);
    if (row.moderationStatus === "adult" || row.moderationStatus === "rejected") {
      return labeledFail || textFail;
    }
    return labeledFail || textFail || jobFail;
  });

  console.log(`Failed moderation jobs: ${failedMediaIds.length}`);
  console.log(`Matched media rows: ${labeled.length}`);
  console.log(`Repairing: ${toRepair.length}`);

  for (const row of toRepair) {
    const existingLabels =
      row.moderationLabels && typeof row.moderationLabels === "object"
        ? (row.moderationLabels as { labels?: string[] })
        : {};
    const nextLabels = Array.from(
      new Set([...(existingLabels.labels ?? []), "processing_failed"]),
    );

    if (row.moderationStatus === "needs_human_review") {
      if (!hasProcessingFailedLabel(row.moderationLabels)) {
        await updateMediaModerationStatus(row.id, "needs_human_review", {
          photodnaMatch: row.photodnaMatch,
          aiCsamScore: row.aiCsamScore,
          aiNudityScore: row.aiNudityScore,
          provider: "script.repair-processing-failed",
          notes: "Tagged scanner/processing failure for the review queue.",
          labels: { ...existingLabels, labels: nextLabels },
        });
        console.log("tagged:", row.id, row.originalFilename);
      } else {
        console.log("already review:", row.id, row.originalFilename);
      }
      continue;
    }

    await updateMediaModerationStatus(row.id, "needs_human_review", {
      photodnaMatch: row.photodnaMatch,
      aiCsamScore: row.aiCsamScore,
      aiNudityScore: row.aiNudityScore,
      provider: "script.repair-processing-failed",
      notes:
        "Moved to human review: scanner/processing failure is not a policy rejection.",
      labels: { ...existingLabels, labels: nextLabels },
    });
    console.log(
      "repaired:",
      row.id,
      row.originalFilename,
      `${row.moderationStatus} → needs_human_review`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
