CREATE INDEX IF NOT EXISTS "memories_user_id_created_at_idx" ON "memories" USING btree ("user_id","created_at");
