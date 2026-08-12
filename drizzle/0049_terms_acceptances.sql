CREATE TABLE "terms_acceptances" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "terms_version" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terms_acceptances"
  ADD CONSTRAINT "terms_acceptances_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "terms_acceptances_user_id_idx"
  ON "terms_acceptances" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "terms_acceptances_email_idx"
  ON "terms_acceptances" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "terms_acceptances_terms_version_idx"
  ON "terms_acceptances" USING btree ("terms_version");
--> statement-breakpoint
CREATE INDEX "terms_acceptances_accepted_at_idx"
  ON "terms_acceptances" USING btree ("accepted_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "terms_acceptances_user_version_uidx"
  ON "terms_acceptances" USING btree ("user_id", "terms_version");
