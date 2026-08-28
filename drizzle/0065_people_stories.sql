ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "story_body" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "story_source_caption_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "story_generated_at" timestamp with time zone;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "story_generated_by" text;
