ALTER TABLE "legacy_videos"
  ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "legacy_videos_user_section_primary_idx"
  ON "legacy_videos" USING btree ("user_id", "section_type", "is_primary");
