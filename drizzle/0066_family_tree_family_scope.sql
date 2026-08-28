-- Family-scoped Family Tree: one tree per family.

CREATE TABLE IF NOT EXISTS "family_trees" (
  "family_id" text PRIMARY KEY REFERENCES "families"("id") ON DELETE cascade,
  "created_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "family_trees_created_by_user_id_idx"
  ON "family_trees" ("created_by_user_id");

ALTER TABLE "family_tree_nodes"
  ADD COLUMN IF NOT EXISTS "family_id" text REFERENCES "families"("id") ON DELETE cascade;
ALTER TABLE "family_tree_relationships"
  ADD COLUMN IF NOT EXISTS "family_id" text REFERENCES "families"("id") ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "family_tree_nodes_family_id_idx"
  ON "family_tree_nodes" ("family_id");
CREATE INDEX IF NOT EXISTS "family_tree_rels_family_id_idx"
  ON "family_tree_relationships" ("family_id");

-- Attach legacy user-scoped trees to the user's first owned family (or first membership).
WITH primary_family AS (
  SELECT DISTINCT ON (u.user_id) u.user_id, u.family_id
  FROM (
    SELECT f.created_by_user_id AS user_id, f.id AS family_id, f.created_at
    FROM families f
    ORDER BY f.created_by_user_id, f.created_at ASC
  ) u
)
UPDATE family_tree_nodes n
SET family_id = pf.family_id
FROM primary_family pf
WHERE n.family_id IS NULL
  AND n.user_id = pf.user_id;

WITH primary_family AS (
  SELECT DISTINCT ON (u.user_id) u.user_id, u.family_id
  FROM (
    SELECT f.created_by_user_id AS user_id, f.id AS family_id, f.created_at
    FROM families f
    ORDER BY f.created_by_user_id, f.created_at ASC
  ) u
)
UPDATE family_tree_relationships r
SET family_id = pf.family_id
FROM primary_family pf
WHERE r.family_id IS NULL
  AND r.user_id = pf.user_id;

-- Fallback: members who have tree rows but don't own a family → first active membership.
WITH member_family AS (
  SELECT DISTINCT ON (fm.user_id) fm.user_id, fm.family_id
  FROM family_members fm
  WHERE fm.status = 'active' AND fm.user_id IS NOT NULL
  ORDER BY fm.user_id, fm.accepted_at ASC NULLS LAST, fm.created_at ASC
)
UPDATE family_tree_nodes n
SET family_id = mf.family_id
FROM member_family mf
WHERE n.family_id IS NULL
  AND n.user_id = mf.user_id;

WITH member_family AS (
  SELECT DISTINCT ON (fm.user_id) fm.user_id, fm.family_id
  FROM family_members fm
  WHERE fm.status = 'active' AND fm.user_id IS NOT NULL
  ORDER BY fm.user_id, fm.accepted_at ASC NULLS LAST, fm.created_at ASC
)
UPDATE family_tree_relationships r
SET family_id = mf.family_id
FROM member_family mf
WHERE r.family_id IS NULL
  AND r.user_id = mf.user_id;

-- Register trees for families that already have nodes.
INSERT INTO family_trees (family_id, created_by_user_id, created_at, updated_at)
SELECT DISTINCT ON (n.family_id)
  n.family_id,
  f.created_by_user_id,
  now(),
  now()
FROM family_tree_nodes n
JOIN families f ON f.id = n.family_id
WHERE n.family_id IS NOT NULL
ON CONFLICT (family_id) DO NOTHING;

-- Default: members of a family with a tree can view it.
UPDATE families f
SET tree_shared_with_family = true, updated_at = now()
WHERE EXISTS (SELECT 1 FROM family_trees t WHERE t.family_id = f.id);

UPDATE family_members fm
SET can_view_tree = true, updated_at = now()
WHERE fm.status IN ('active', 'pending')
  AND EXISTS (SELECT 1 FROM family_trees t WHERE t.family_id = fm.family_id);
