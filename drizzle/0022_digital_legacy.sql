CREATE TYPE "public"."legacy_contact_category" AS ENUM(
  'attorney',
  'insurance_agent',
  'accountant',
  'business_partner',
  'family',
  'executor',
  'other'
);
--> statement-breakpoint
CREATE TYPE "public"."legacy_instruction_section_type" AS ENUM(
  'personal',
  'financial',
  'business_operations',
  'accounts_access',
  'legal',
  'survivors_guidance'
);
--> statement-breakpoint
CREATE TYPE "public"."legacy_secure_item_type" AS ENUM(
  'password',
  'account_info',
  'location_of_documents',
  'other'
);
--> statement-breakpoint
CREATE TABLE "legacy_profile" (
  "user_id" text PRIMARY KEY NOT NULL,
  "summary_message" text,
  "funeral_preferences" text,
  "general_instructions" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "relationship" text,
  "category" "legacy_contact_category" DEFAULT 'other' NOT NULL,
  "phone" text,
  "email" text,
  "notes" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_instructions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "section_type" "legacy_instruction_section_type" NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_secure_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "label" text NOT NULL,
  "item_type" "legacy_secure_item_type" DEFAULT 'other' NOT NULL,
  "content" text NOT NULL,
  "related_document_id" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_profile"
  ADD CONSTRAINT "legacy_profile_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_contacts"
  ADD CONSTRAINT "legacy_contacts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_instructions"
  ADD CONSTRAINT "legacy_instructions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_secure_items"
  ADD CONSTRAINT "legacy_secure_items_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legacy_secure_items"
  ADD CONSTRAINT "legacy_secure_items_related_document_id_private_documents_id_fk"
  FOREIGN KEY ("related_document_id") REFERENCES "public"."private_documents"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "legacy_contacts_user_id_idx"
  ON "legacy_contacts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "legacy_contacts_user_primary_idx"
  ON "legacy_contacts" USING btree ("user_id", "is_primary");
--> statement-breakpoint
CREATE INDEX "legacy_contacts_user_category_idx"
  ON "legacy_contacts" USING btree ("user_id", "category");
--> statement-breakpoint
CREATE INDEX "legacy_instructions_user_id_idx"
  ON "legacy_instructions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "legacy_instructions_user_section_idx"
  ON "legacy_instructions" USING btree ("user_id", "section_type", "sort_order");
--> statement-breakpoint
CREATE INDEX "legacy_secure_items_user_id_idx"
  ON "legacy_secure_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "legacy_secure_items_user_type_idx"
  ON "legacy_secure_items" USING btree ("user_id", "item_type");
--> statement-breakpoint
CREATE INDEX "legacy_secure_items_related_document_idx"
  ON "legacy_secure_items" USING btree ("related_document_id");
