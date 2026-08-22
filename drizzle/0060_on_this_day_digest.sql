-- Capture date for On This Day + weekly digest notification type
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'weekly_digest';
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "taken_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_taken_at_idx" ON "media" USING btree ("taken_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_user_clean_ready_taken_idx" ON "media" USING btree ("user_id","moderation_status","status","taken_at");
