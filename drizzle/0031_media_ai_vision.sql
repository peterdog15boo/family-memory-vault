ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "ai_caption" text;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "ai_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "ai_objects" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "ai_scenes" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "ai_description" text;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "ai_embedding" jsonb;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "visual_analyzed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_visual_analyzed_at_idx" ON "media" USING btree ("visual_analyzed_at");
