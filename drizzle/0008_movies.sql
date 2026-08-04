CREATE TYPE "public"."movie_status" AS ENUM('queued', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."movie_style" AS ENUM('holiday', 'birthday', 'cinematic', 'simple');--> statement-breakpoint
CREATE TABLE "movies" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "movie_status" DEFAULT 'queued' NOT NULL,
	"style" "movie_style" DEFAULT 'simple' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_key" text,
	"thumbnail_key" text,
	"duration_seconds" double precision,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movies_user_id_idx" ON "movies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "movies_memory_id_idx" ON "movies" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "movies_status_idx" ON "movies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "movies_user_id_created_at_idx" ON "movies" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "movies_memory_id_created_at_idx" ON "movies" USING btree ("memory_id","created_at");
