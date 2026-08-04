ALTER TABLE "media" ADD COLUMN "scene_caption" text;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "scene_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "scene_analyzed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "scene_analysis_status" text;
--> statement-breakpoint
CREATE INDEX "media_scene_analyzed_at_idx" ON "media" USING btree ("scene_analyzed_at");
--> statement-breakpoint
CREATE INDEX "media_user_scene_status_idx" ON "media" USING btree ("user_id", "scene_analysis_status");
