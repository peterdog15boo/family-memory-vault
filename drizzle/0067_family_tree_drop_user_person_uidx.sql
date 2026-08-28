-- Allow the same People record on multiple family trees (drop legacy per-user unique).
DROP INDEX IF EXISTS "family_tree_nodes_user_person_uidx";
