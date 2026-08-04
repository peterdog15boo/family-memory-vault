CREATE TABLE IF NOT EXISTS "legacy_instruction_documents" (
  "instruction_id" text NOT NULL REFERENCES "legacy_instructions"("id") ON DELETE cascade,
  "document_id" text NOT NULL REFERENCES "private_documents"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("instruction_id","document_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_instruction_documents_user_idx"
  ON "legacy_instruction_documents" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_instruction_documents_instruction_idx"
  ON "legacy_instruction_documents" ("instruction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legacy_instruction_documents_document_idx"
  ON "legacy_instruction_documents" ("document_id");
