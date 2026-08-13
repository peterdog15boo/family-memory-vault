ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_sharing" text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_label" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_city" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_region" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_country" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "latitude" double precision;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "longitude" double precision;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location_updated_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_location_sharing_check"
    CHECK ("location_sharing" IN ('off', 'city', 'precise'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_location_sharing_idx" ON "users" ("location_sharing");
