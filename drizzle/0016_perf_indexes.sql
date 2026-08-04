CREATE INDEX IF NOT EXISTS "memories_user_shared_created_idx"
  ON "memories" ("user_id", "shared_with_family", "created_at");

CREATE INDEX IF NOT EXISTS "people_user_id_updated_at_idx"
  ON "people" ("user_id", "updated_at");

CREATE INDEX IF NOT EXISTS "faces_user_person_created_idx"
  ON "faces" ("user_id", "person_id", "created_at");
