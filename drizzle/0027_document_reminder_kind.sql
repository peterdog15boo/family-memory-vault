CREATE TYPE "document_reminder_kind" AS ENUM(
  'renewal',
  'contract_end',
  'expiration',
  'review',
  'other'
);
--> statement-breakpoint
ALTER TABLE "private_documents"
  ADD COLUMN IF NOT EXISTS "reminder_kind" "document_reminder_kind";
--> statement-breakpoint
UPDATE "private_documents"
SET "reminder_kind" = 'other'
WHERE "reminder_at" IS NOT NULL AND "reminder_kind" IS NULL;
