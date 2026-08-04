-- Face grouping: people identities + detected faces
-- faces.media_id / faces.person_id are the primary join paths (no separate face_media table).

CREATE TABLE IF NOT EXISTS "people" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"cover_face_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_id" text NOT NULL,
	"person_id" text,
	"bounding_box" jsonb NOT NULL,
	"embedding" jsonb,
	"face_token" text,
	"confidence" double precision,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "faces" ADD CONSTRAINT "faces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "faces" ADD CONSTRAINT "faces_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "faces" ADD CONSTRAINT "faces_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "people" ADD CONSTRAINT "people_cover_face_id_faces_id_fk" FOREIGN KEY ("cover_face_id") REFERENCES "public"."faces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_id_idx" ON "people" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_id_name_idx" ON "people" USING btree ("user_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_cover_face_id_idx" ON "people" USING btree ("cover_face_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faces_media_id_idx" ON "faces" USING btree ("media_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faces_person_id_idx" ON "faces" USING btree ("person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faces_user_id_idx" ON "faces" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faces_user_id_person_id_idx" ON "faces" USING btree ("user_id","person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faces_face_token_idx" ON "faces" USING btree ("face_token");
