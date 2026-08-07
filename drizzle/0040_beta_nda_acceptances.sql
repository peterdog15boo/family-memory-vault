CREATE TABLE "beta_nda_acceptances" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "nda_version" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beta_nda_acceptances"
  ADD CONSTRAINT "beta_nda_acceptances_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "beta_nda_acceptances_user_id_idx"
  ON "beta_nda_acceptances" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "beta_nda_acceptances_email_idx"
  ON "beta_nda_acceptances" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "beta_nda_acceptances_nda_version_idx"
  ON "beta_nda_acceptances" USING btree ("nda_version");
--> statement-breakpoint
CREATE INDEX "beta_nda_acceptances_accepted_at_idx"
  ON "beta_nda_acceptances" USING btree ("accepted_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "beta_nda_acceptances_user_version_uidx"
  ON "beta_nda_acceptances" USING btree ("user_id", "nda_version");
