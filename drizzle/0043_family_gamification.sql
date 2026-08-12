ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'family_milestone';
--> statement-breakpoint
ALTER TABLE "family_members"
  ADD COLUMN IF NOT EXISTS "first_contributed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_progress"
  ADD COLUMN IF NOT EXISTS "invites_sent_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_progress"
  ADD COLUMN IF NOT EXISTS "active_circle_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "family_progress"
  ADD COLUMN IF NOT EXISTS "contributing_members" integer DEFAULT 0 NOT NULL;
