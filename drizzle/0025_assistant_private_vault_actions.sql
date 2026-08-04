ALTER TYPE "assistant_action_type" ADD VALUE IF NOT EXISTS 'create_document_category';
--> statement-breakpoint
ALTER TYPE "assistant_action_type" ADD VALUE IF NOT EXISTS 'file_private_document';
--> statement-breakpoint
ALTER TYPE "assistant_action_type" ADD VALUE IF NOT EXISTS 'add_legacy_contact';
--> statement-breakpoint
ALTER TYPE "assistant_action_type" ADD VALUE IF NOT EXISTS 'draft_legacy_business';
--> statement-breakpoint
ALTER TYPE "assistant_action_type" ADD VALUE IF NOT EXISTS 'review_legacy_checklist';
