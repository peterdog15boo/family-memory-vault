CREATE TABLE "document_categories" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "category_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "original_filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_key" text NOT NULL,
  "thumbnail_key" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "document_date" timestamp with time zone,
  "important_flag" boolean DEFAULT false NOT NULL,
  "reminder_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_categories"
  ADD CONSTRAINT "document_categories_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_documents"
  ADD CONSTRAINT "private_documents_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_documents"
  ADD CONSTRAINT "private_documents_category_id_document_categories_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "document_categories_user_slug_uidx"
  ON "document_categories" USING btree ("user_id", "slug");
--> statement-breakpoint
CREATE INDEX "document_categories_user_id_idx"
  ON "document_categories" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "document_categories_user_sort_idx"
  ON "document_categories" USING btree ("user_id", "sort_order");
--> statement-breakpoint
CREATE INDEX "private_documents_user_id_idx"
  ON "private_documents" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "private_documents_user_category_idx"
  ON "private_documents" USING btree ("user_id", "category_id");
--> statement-breakpoint
CREATE INDEX "private_documents_user_created_idx"
  ON "private_documents" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "private_documents_user_important_idx"
  ON "private_documents" USING btree ("user_id", "important_flag");
--> statement-breakpoint
CREATE INDEX "private_documents_user_reminder_idx"
  ON "private_documents" USING btree ("user_id", "reminder_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "private_documents_storage_key_uidx"
  ON "private_documents" USING btree ("storage_key");
