CREATE TYPE "public"."media_connection_status" AS ENUM('active', 'error', 'disconnected');--> statement-breakpoint
CREATE TABLE "media_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"account_label" text,
	"external_account_id" text,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "media_connection_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "import_provider" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "import_external_id" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "pending_memory_id" text;--> statement-breakpoint
ALTER TABLE "media_connections" ADD CONSTRAINT "media_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_connections_user_provider_account_uidx" ON "media_connections" USING btree ("user_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "media_connections_user_id_idx" ON "media_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_connections_user_status_idx" ON "media_connections" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_import_dedupe_uidx" ON "media" USING btree ("user_id","import_provider","import_external_id") WHERE "import_provider" IS NOT NULL AND "import_external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "media_pending_memory_id_idx" ON "media" USING btree ("pending_memory_id");--> statement-breakpoint
CREATE INDEX "media_import_provider_idx" ON "media" USING btree ("user_id","import_provider");
