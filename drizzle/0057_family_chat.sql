CREATE TABLE IF NOT EXISTS "family_chat_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "family_chat_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"last_read_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "family_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_threads" ADD CONSTRAINT "family_chat_threads_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_participants" ADD CONSTRAINT "family_chat_participants_thread_id_family_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."family_chat_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_participants" ADD CONSTRAINT "family_chat_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_messages" ADD CONSTRAINT "family_chat_messages_thread_id_family_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."family_chat_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_chat_messages" ADD CONSTRAINT "family_chat_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_chat_threads_family_id_uidx" ON "family_chat_threads" USING btree ("family_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_chat_participants_thread_user_uidx" ON "family_chat_participants" USING btree ("thread_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_participants_user_id_idx" ON "family_chat_participants" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_participants_thread_included_idx" ON "family_chat_participants" USING btree ("thread_id","included");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_messages_thread_created_idx" ON "family_chat_messages" USING btree ("thread_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_chat_messages_sender_idx" ON "family_chat_messages" USING btree ("sender_user_id");
