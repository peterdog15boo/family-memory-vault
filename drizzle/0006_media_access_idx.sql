-- Speed up My Library / Shared with Family media galleries:
-- filter by owner(s) + clean/ready, order by newest first.
CREATE INDEX IF NOT EXISTS "media_user_clean_ready_created_idx"
  ON "media" USING btree ("user_id", "moderation_status", "status", "created_at");
