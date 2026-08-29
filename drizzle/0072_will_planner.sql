CREATE TYPE "public"."will_draft_status" AS ENUM('in_progress', 'draft_ready', 'archived');
--> statement-breakpoint
CREATE TABLE "will_disclaimer_acceptances" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "disclaimer_version" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "will_drafts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "family_id" text,
  "status" "will_draft_status" DEFAULT 'in_progress' NOT NULL,
  "state_code" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_markdown" text,
  "generated_at" timestamp with time zone,
  "disclaimer_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "will_disclaimer_acceptances"
  ADD CONSTRAINT "will_disclaimer_acceptances_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "will_drafts"
  ADD CONSTRAINT "will_drafts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "will_drafts"
  ADD CONSTRAINT "will_drafts_family_id_families_id_fk"
  FOREIGN KEY ("family_id") REFERENCES "public"."families"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "will_disclaimer_acceptances_user_id_idx"
  ON "will_disclaimer_acceptances" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "will_disclaimer_acceptances_version_idx"
  ON "will_disclaimer_acceptances" USING btree ("disclaimer_version");
--> statement-breakpoint
CREATE UNIQUE INDEX "will_disclaimer_acceptances_user_version_uidx"
  ON "will_disclaimer_acceptances" USING btree ("user_id", "disclaimer_version");
--> statement-breakpoint
CREATE INDEX "will_drafts_user_id_idx"
  ON "will_drafts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "will_drafts_user_status_idx"
  ON "will_drafts" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX "will_drafts_family_id_idx"
  ON "will_drafts" USING btree ("family_id");
