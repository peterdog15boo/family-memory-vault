-- Evolve beta_feedback into feedback_submissions with triage status + ticket IDs.
ALTER TABLE "beta_feedback"
  ADD COLUMN IF NOT EXISTS "ticket_id" text;
--> statement-breakpoint
ALTER TABLE "beta_feedback"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
ALTER TABLE "beta_feedback"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "beta_feedback"
  ADD COLUMN IF NOT EXISTS "context" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "beta_feedback"
SET "ticket_id" = 'FMV-' || upper(substr(replace("id", '-', ''), 1, 6))
WHERE "ticket_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "beta_feedback"
  ALTER COLUMN "ticket_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'beta_feedback'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feedback_submissions'
  ) THEN
    ALTER TABLE "beta_feedback" RENAME TO "feedback_submissions";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'beta_feedback_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "feedback_submissions"
      RENAME CONSTRAINT "beta_feedback_user_id_users_id_fk"
      TO "feedback_submissions_user_id_users_id_fk";
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
--> statement-breakpoint
ALTER INDEX IF EXISTS "beta_feedback_user_id_idx"
  RENAME TO "feedback_submissions_user_id_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "beta_feedback_mode_idx"
  RENAME TO "feedback_submissions_mode_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "beta_feedback_category_idx"
  RENAME TO "feedback_submissions_category_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "beta_feedback_created_at_idx"
  RENAME TO "feedback_submissions_created_at_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_submissions_ticket_id_uidx"
  ON "feedback_submissions" USING btree ("ticket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_submissions_status_idx"
  ON "feedback_submissions" USING btree ("status");
