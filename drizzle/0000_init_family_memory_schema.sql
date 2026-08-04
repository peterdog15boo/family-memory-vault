CREATE TYPE "public"."media_status" AS ENUM('uploaded', 'pending_moderation', 'ready', 'rejected', 'csam_quarantined');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('photo', 'video');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('album', 'story');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'clean', 'adult', 'csam_quarantined', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."processing_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "media_type" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"original_filename" text,
	"original_key" text NOT NULL,
	"processed_key" text,
	"thumbnail_key" text,
	"status" "media_status" DEFAULT 'uploaded' NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"moderation_labels" jsonb,
	"photodna_match" boolean DEFAULT false NOT NULL,
	"ai_csam_score" double precision,
	"ai_nudity_score" double precision,
	"quarantined_at" timestamp with time zone,
	"ncmec_report_id" text,
	"ncmec_reported_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "memory_type" DEFAULT 'album' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_media_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_media" (
	"memory_id" text NOT NULL,
	"media_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_media_pk" PRIMARY KEY("memory_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"previous_moderation_status" text,
	"new_moderation_status" text,
	"labels" jsonb,
	"ai_csam_score" double precision,
	"ai_nudity_score" double precision,
	"photodna_match" boolean,
	"actor_id" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "processing_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_user_id_idx" ON "media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_status_idx" ON "media" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_moderation_status_idx" ON "media" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "media_user_id_status_idx" ON "media" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "media_photodna_match_idx" ON "media" USING btree ("photodna_match");--> statement-breakpoint
CREATE INDEX "media_ncmec_report_id_idx" ON "media" USING btree ("ncmec_report_id");--> statement-breakpoint
CREATE INDEX "memories_user_id_idx" ON "memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memories_type_idx" ON "memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "memory_media_media_id_idx" ON "memory_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "memory_media_memory_id_sort_idx" ON "memory_media" USING btree ("memory_id","sort_order");--> statement-breakpoint
CREATE INDEX "moderation_events_media_id_idx" ON "moderation_events" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "moderation_events_event_type_idx" ON "moderation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "moderation_events_created_at_idx" ON "moderation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "moderation_events_source_idx" ON "moderation_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "processing_jobs_status_available_at_idx" ON "processing_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_type_idx" ON "processing_jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "processing_jobs_media_id_idx" ON "processing_jobs" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");