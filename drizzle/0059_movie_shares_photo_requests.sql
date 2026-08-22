-- Public movie share links + family photo contribution requests
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'photo_request';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_shares" ADD CONSTRAINT "movie_shares_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_shares" ADD CONSTRAINT "movie_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "movie_shares_token_uidx" ON "movie_shares" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_shares_movie_id_idx" ON "movie_shares" USING btree ("movie_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_shares_user_id_idx" ON "movie_shares" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photo_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"target_member_id" text NOT NULL,
	"memory_id" text,
	"person_id" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_requests" ADD CONSTRAINT "photo_requests_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_requests" ADD CONSTRAINT "photo_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_requests" ADD CONSTRAINT "photo_requests_target_member_id_family_members_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_requests" ADD CONSTRAINT "photo_requests_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_requests" ADD CONSTRAINT "photo_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "photo_requests_token_uidx" ON "photo_requests" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_requests_family_id_idx" ON "photo_requests" USING btree ("family_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_requests_target_member_idx" ON "photo_requests" USING btree ("target_member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_requests_requested_by_idx" ON "photo_requests" USING btree ("requested_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_requests_status_idx" ON "photo_requests" USING btree ("status");
