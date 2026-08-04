/**
 * One-shot status for scene analysis backfill.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const withRows = result as { rows?: unknown[] };
  return withRows.rows ?? [];
}

async function main() {
  const db = getDb();
  const result = await db.execute(sql`
    select
      (select count(*)::int from media
        where type='photo' and status='ready' and moderation_status='clean') as eligible_clean_ready,
      (select count(*)::int from media
        where type='photo' and status='ready' and moderation_status='clean'
          and (
            visual_analyzed_at is null
            or scene_analyzed_at is null
            or scene_analysis_status is null
            or scene_analysis_status in ('pending','failed')
            or coalesce(jsonb_array_length(ai_tags),0) < 3
            or ai_scenes is null
            or coalesce(jsonb_array_length(ai_scenes),0)=0
          )) as pending_or_sparse,
      (select count(*)::int from media
        where type='photo' and status='ready' and moderation_status='clean'
          and visual_analyzed_at is not null
          and coalesce(jsonb_array_length(ai_tags),0) >= 1) as already_labeled,
      (select count(*)::int from processing_jobs
        where type='media.scene' and status='pending') as scene_pending,
      (select count(*)::int from processing_jobs
        where type='media.scene' and status='processing') as scene_processing,
      (select count(*)::int from processing_jobs
        where type='media.scene' and status='completed') as scene_completed,
      (select count(*)::int from processing_jobs
        where type='media.scene' and status='failed') as scene_failed
  `);
  console.log(JSON.stringify(rowsOf(result)[0] ?? result, null, 2));

  const samples = await db.execute(sql`
    select id,
      left(coalesce(ai_caption, scene_caption, ''), 80) as caption,
      coalesce(jsonb_array_length(ai_tags), 0) as tag_count,
      coalesce(jsonb_array_length(ai_objects), 0) as object_count,
      coalesce(jsonb_array_length(ai_scenes), 0) as scene_count,
      visual_analyzed_at,
      scene_analysis_status
    from media
    where type='photo' and status='ready' and moderation_status='clean'
      and visual_analyzed_at is not null
    order by visual_analyzed_at desc nulls last
    limit 5
  `);
  console.log("--- recent labeled samples ---");
  console.log(JSON.stringify(rowsOf(samples), null, 2));

  const fails = await db.execute(sql`
    select id, left(coalesce(last_error, ''), 200) as last_error, attempts, updated_at
    from processing_jobs
    where type='media.scene' and status='failed'
    order by updated_at desc
    limit 8
  `);
  console.log("--- recent failed scene jobs ---");
  console.log(JSON.stringify(rowsOf(fails), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
