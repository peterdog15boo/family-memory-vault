-- Sensitive access audit log (private documents, legacy secure items, emergency access).

CREATE TABLE "sensitive_access_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sensitive_access_events"
  ADD CONSTRAINT "sensitive_access_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sensitive_access_events_user_id_idx"
  ON "sensitive_access_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "sensitive_access_events_action_idx"
  ON "sensitive_access_events" USING btree ("action");
--> statement-breakpoint
CREATE INDEX "sensitive_access_events_target_idx"
  ON "sensitive_access_events" USING btree ("target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "sensitive_access_events_created_idx"
  ON "sensitive_access_events" USING btree ("created_at");
