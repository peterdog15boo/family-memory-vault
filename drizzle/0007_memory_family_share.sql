CREATE TYPE "public"."memory_family_access" AS ENUM('view', 'contribute');--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "shared_with_family" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "family_access" "memory_family_access" DEFAULT 'view' NOT NULL;--> statement-breakpoint
CREATE INDEX "memories_shared_family_created_idx" ON "memories" USING btree ("shared_with_family","created_at");
