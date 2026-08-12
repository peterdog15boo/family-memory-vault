ALTER TABLE "beta_feedback"
  ADD COLUMN IF NOT EXISTS "screenshot_key" text;
--> statement-breakpoint
ALTER TABLE "beta_feedback"
  ADD COLUMN IF NOT EXISTS "screenshot_content_type" text;
