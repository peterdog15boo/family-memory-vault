ALTER TABLE "will_drafts"
  ADD COLUMN "signing_checklist" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "will_drafts"
  ADD COLUMN "signed_scan" jsonb;
