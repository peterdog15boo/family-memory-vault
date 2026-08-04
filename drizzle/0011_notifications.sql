CREATE TYPE "public"."notification_type" AS ENUM(
  'media_ready',
  'movie_ready',
  'family_invite',
  'storage_warning',
  'moderation_attention'
);
--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "link" text,
  "read_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_users_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "notifications_user_read_at_idx" ON "notifications" USING btree ("user_id", "read_at");
--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");
