ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'legacy_milestone';
--> statement-breakpoint
CREATE TYPE "public"."legacy_planning_sensitivity" AS ENUM(
  'owner_only',
  'emergency_ok'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_planning_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "category_id" text NOT NULL,
  "title" text NOT NULL,
  "institution" text,
  "account_hint" text,
  "location_hint" text,
  "contact_name" text,
  "contact_phone" text,
  "contact_email" text,
  "notes" text,
  "sensitivity" "legacy_planning_sensitivity" DEFAULT 'emergency_ok' NOT NULL,
  "last_verified_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_planning_item_documents" (
  "item_id" text NOT NULL,
  "document_id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legacy_planning_item_documents_item_id_document_id_pk"
    PRIMARY KEY ("item_id", "document_id")
);
--> statement-breakpoint
ALTER TABLE "legacy_planning_items"
  ADD CONSTRAINT "legacy_planning_items_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_planning_item_documents"
  ADD CONSTRAINT "legacy_planning_item_documents_item_id_legacy_planning_items_id_fk"
  FOREIGN KEY ("item_id") REFERENCES "public"."legacy_planning_items"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_planning_item_documents"
  ADD CONSTRAINT "legacy_planning_item_documents_document_id_private_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."private_documents"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_planning_item_documents"
  ADD CONSTRAINT "legacy_planning_item_documents_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_planning_items_user_id_idx"
  ON "legacy_planning_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_planning_items_user_category_idx"
  ON "legacy_planning_items" USING btree ("user_id", "category_id", "sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_planning_item_documents_user_idx"
  ON "legacy_planning_item_documents" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_planning_item_documents_item_idx"
  ON "legacy_planning_item_documents" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_planning_item_documents_document_idx"
  ON "legacy_planning_item_documents" USING btree ("document_id");
