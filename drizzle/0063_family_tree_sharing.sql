-- Family Tree sharing: family-level share flag + per-member view/contribute
ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "tree_shared_with_family" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN IF NOT EXISTS "can_view_tree" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN IF NOT EXISTS "can_contribute_tree" boolean DEFAULT false NOT NULL;
