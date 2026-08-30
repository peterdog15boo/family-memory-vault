CREATE TYPE "public"."trust_draft_status" AS ENUM('in_progress', 'draft_ready', 'archived');
--> statement-breakpoint
CREATE TABLE "trust_disclaimer_acceptances" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "disclaimer_version" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_drafts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "status" "trust_draft_status" DEFAULT 'in_progress' NOT NULL,
  "state_code" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_markdown" text,
  "generated_at" timestamp with time zone,
  "funding_checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "disclaimer_version" text NOT NULL,
  "linked_will_draft_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_disclaimer_acceptances"
  ADD CONSTRAINT "trust_disclaimer_acceptances_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_drafts"
  ADD CONSTRAINT "trust_drafts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_drafts"
  ADD CONSTRAINT "trust_drafts_linked_will_draft_id_will_drafts_id_fk"
  FOREIGN KEY ("linked_will_draft_id") REFERENCES "public"."will_drafts"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trust_disclaimer_acceptances_user_id_idx"
  ON "trust_disclaimer_acceptances" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "trust_disclaimer_acceptances_version_idx"
  ON "trust_disclaimer_acceptances" USING btree ("disclaimer_version");
--> statement-breakpoint
CREATE UNIQUE INDEX "trust_disclaimer_acceptances_user_version_uidx"
  ON "trust_disclaimer_acceptances" USING btree ("user_id", "disclaimer_version");
--> statement-breakpoint
CREATE INDEX "trust_drafts_user_id_idx"
  ON "trust_drafts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "trust_drafts_user_status_idx"
  ON "trust_drafts" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX "trust_drafts_linked_will_draft_id_idx"
  ON "trust_drafts" USING btree ("linked_will_draft_id");
