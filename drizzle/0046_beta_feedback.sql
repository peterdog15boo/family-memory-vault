CREATE TABLE IF NOT EXISTS "beta_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "email" text,
  "mode" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "expected_behavior" text,
  "severity" text,
  "problem_statement" text,
  "suggested_solution" text,
  "category" text NOT NULL,
  "pathname" text NOT NULL,
  "page_url" text NOT NULL,
  "browser" text,
  "os" text,
  "viewport_width" integer,
  "viewport_height" integer,
  "device_pixel_ratio" double precision,
  "console_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "user_agent" text,
  "client_timestamp" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beta_feedback"
  ADD CONSTRAINT "beta_feedback_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beta_feedback_user_id_idx"
  ON "beta_feedback" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beta_feedback_mode_idx"
  ON "beta_feedback" USING btree ("mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beta_feedback_category_idx"
  ON "beta_feedback" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beta_feedback_created_at_idx"
  ON "beta_feedback" USING btree ("created_at");
