-- Temporary vs permanent emergency access grants.
-- Existing rows default to temporary (no behavior change).

CREATE TYPE "public"."emergency_access_type" AS ENUM(
  'temporary',
  'permanent'
);
--> statement-breakpoint
ALTER TABLE "emergency_access_designations"
  ADD COLUMN "access_type" "emergency_access_type" DEFAULT 'temporary' NOT NULL;
