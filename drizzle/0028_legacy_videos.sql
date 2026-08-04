CREATE TYPE "public"."legacy_video_section_type" AS ENUM(
  'personal',
  'financial',
  'business_operations',
  'accounts_access',
  'legal',
  'survivors_guidance',
  'message_to_loved_ones',
  'custom'
);
--> statement-breakpoint
CREATE TYPE "public"."legacy_video_source_type" AS ENUM(
  'recorded',
  'uploaded'
);
--> statement-breakpoint
CREATE TABLE "legacy_videos" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "section_type" "legacy_video_section_type" NOT NULL,
  "legacy_instruction_id" text,
  "title" text NOT NULL,
  "description" text,
  "storage_key" text NOT NULL,
  "thumbnail_key" text,
  "duration_seconds" integer,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "source_type" "legacy_video_source_type" DEFAULT 'uploaded' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_videos"
  ADD CONSTRAINT "legacy_videos_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_videos"
  ADD CONSTRAINT "legacy_videos_legacy_instruction_id_legacy_instructions_id_fk"
  FOREIGN KEY ("legacy_instruction_id") REFERENCES "public"."legacy_instructions"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "legacy_videos_user_id_idx"
  ON "legacy_videos" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "legacy_videos_user_section_idx"
  ON "legacy_videos" USING btree ("user_id", "section_type", "sort_order");
--> statement-breakpoint
CREATE INDEX "legacy_videos_instruction_idx"
  ON "legacy_videos" USING btree ("legacy_instruction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_videos_storage_key_uidx"
  ON "legacy_videos" USING btree ("storage_key");
