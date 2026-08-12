import { config } from "dotenv";
import { desc, eq, sql } from "drizzle-orm";

config({ path: ".env.local", override: true });
config({ override: true });

async function main() {
  const { getDb } = await import("../src/lib/db");
  const { media, processingJobs } = await import("../src/lib/db/schema");
  const db = getDb();

  const rows = await db
    .select({
      id: media.id,
      name: media.originalFilename,
      status: media.status,
      moderation: media.moderationStatus,
      createdAt: media.createdAt,
    })
    .from(media)
    .orderBy(desc(media.createdAt))
    .limit(25);

  console.log("\n=== recent media ===");
  for (const row of rows) {
    console.log(
      `${row.createdAt.toISOString()}  ${row.status.padEnd(20)} ${row.moderation.padEnd(22)} ${row.name ?? row.id}`,
    );
  }

  const counts = await db
    .select({
      moderation: media.moderationStatus,
      status: media.status,
      n: sql<number>`count(*)::int`,
    })
    .from(media)
    .groupBy(media.moderationStatus, media.status);
  console.log("\n=== media status counts ===");
  console.log(counts);

  const jobs = await db
    .select({
      type: processingJobs.type,
      status: processingJobs.status,
      n: sql<number>`count(*)::int`,
    })
    .from(processingJobs)
    .groupBy(processingJobs.type, processingJobs.status);
  console.log("\n=== jobs ===");
  console.log(jobs);

  const recentIds = rows.map((r) => r.id);
  if (recentIds.length) {
    const related = await db
      .select({
        mediaId: processingJobs.mediaId,
        type: processingJobs.type,
        status: processingJobs.status,
        attempts: processingJobs.attempts,
        lastError: processingJobs.lastError,
        createdAt: processingJobs.createdAt,
      })
      .from(processingJobs)
      .where(eq(processingJobs.type, "moderation"))
      .orderBy(desc(processingJobs.createdAt))
      .limit(30);
    console.log("\n=== recent moderation jobs ===");
    for (const job of related) {
      console.log(
        `${job.createdAt.toISOString()}  ${String(job.status).padEnd(12)} att=${job.attempts} media=${job.mediaId} err=${job.lastError?.slice(0, 80) ?? ""}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
