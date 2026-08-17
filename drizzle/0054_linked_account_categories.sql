CREATE TYPE "public"."linked_account_category" AS ENUM('banking', 'investments', 'loans_debt', 'credit_cards', 'insurance_benefits', 'other');--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD COLUMN "category" "linked_account_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD COLUMN "category_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "linked_accounts_user_category_idx" ON "linked_accounts" USING btree ("user_id","category");
