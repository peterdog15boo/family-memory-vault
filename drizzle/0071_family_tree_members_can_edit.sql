-- Family-level tree edit gate (share is separate; invite ≠ tree share).
ALTER TABLE "families"
  ADD COLUMN IF NOT EXISTS "members_can_edit_tree" boolean DEFAULT false NOT NULL;

-- Align share default for new families: off until the creator turns it on.
ALTER TABLE "families"
  ALTER COLUMN "tree_shared_with_family" SET DEFAULT false;
