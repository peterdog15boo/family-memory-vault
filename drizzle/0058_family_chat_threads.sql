-- Multi-thread Family Chat + family-level eligibility
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'family_chat';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "family_chat_eligibility" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"user_id" text NOT NULL,
	"eligible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_eligibility" ADD CONSTRAINT "family_chat_eligibility_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_eligibility" ADD CONSTRAINT "family_chat_eligibility_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_chat_eligibility_family_user_uidx" ON "family_chat_eligibility" USING btree ("family_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_eligibility_family_eligible_idx" ON "family_chat_eligibility" USING btree ("family_id","eligible");
--> statement-breakpoint
ALTER TABLE "family_chat_threads" ADD COLUMN IF NOT EXISTS "created_by_user_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_threads" ADD CONSTRAINT "family_chat_threads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "family_chat_threads_family_id_uidx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_threads_family_id_idx" ON "family_chat_threads" USING btree ("family_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_threads_family_updated_idx" ON "family_chat_threads" USING btree ("family_id","updated_at");
--> statement-breakpoint
-- Backfill eligibility from prior participant.included flags (any false → not eligible).
INSERT INTO "family_chat_eligibility" ("id", "family_id", "user_id", "eligible", "created_at", "updated_at")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || p.user_id), 1, 21),
  t.family_id,
  p.user_id,
  bool_and(p.included),
  now(),
  now()
FROM "family_chat_participants" p
INNER JOIN "family_chat_threads" t ON t.id = p.thread_id
GROUP BY t.family_id, p.user_id
ON CONFLICT ("family_id", "user_id") DO NOTHING;
--> statement-breakpoint
-- Ensure every active family member has an eligibility row (default eligible).
INSERT INTO "family_chat_eligibility" ("id", "family_id", "user_id", "eligible", "created_at", "updated_at")
SELECT
  substr(md5(random()::text || clock_timestamp()::text || fm.user_id), 1, 21),
  fm.family_id,
  fm.user_id,
  true,
  now(),
  now()
FROM "family_members" fm
WHERE fm.status = 'active' AND fm.user_id IS NOT NULL
ON CONFLICT ("family_id", "user_id") DO NOTHING;
