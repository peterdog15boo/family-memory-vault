-- Emergency access designations — break-glass access to Digital Legacy
-- Separate from family sharing — owner designates trusted contacts by email

CREATE TYPE "public"."emergency_access_status" AS ENUM(
  'designated',
  'requested',
  'granted',
  'denied',
  'expired'
);
--> statement-breakpoint
CREATE TABLE "emergency_access_designations" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "designatee_email" text NOT NULL,
  "designatee_user_id" text,
  "designatee_name" text NOT NULL,
  "relationship" text,
  "status" "emergency_access_status" DEFAULT 'designated' NOT NULL,
  "waiting_period_hours" integer DEFAULT 72 NOT NULL,
  "grant_duration_days" integer DEFAULT 30 NOT NULL,
  "requested_at" timestamp with time zone,
  "waiting_ends_at" timestamp with time zone,
  "granted_at" timestamp with time zone,
  "granted_by" text,
  "grant_expires_at" timestamp with time zone,
  "denied_at" timestamp with time zone,
  "denial_reason" text,
  "owner_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_access_designations"
  ADD CONSTRAINT "emergency_access_designations_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "emergency_access_designations"
  ADD CONSTRAINT "emergency_access_designations_designatee_user_id_users_id_fk"
  FOREIGN KEY ("designatee_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "emergency_access_owner_user_id_idx"
  ON "emergency_access_designations" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "emergency_access_designatee_email_idx"
  ON "emergency_access_designations" USING btree ("designatee_email");
--> statement-breakpoint
CREATE INDEX "emergency_access_designatee_user_id_idx"
  ON "emergency_access_designations" USING btree ("designatee_user_id");
--> statement-breakpoint
CREATE INDEX "emergency_access_owner_status_idx"
  ON "emergency_access_designations" USING btree ("owner_user_id", "status");
--> statement-breakpoint
CREATE INDEX "emergency_access_designatee_status_idx"
  ON "emergency_access_designations" USING btree ("designatee_user_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_access_owner_email_uidx"
  ON "emergency_access_designations" USING btree ("owner_user_id", "designatee_email");
--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'emergency_access';
