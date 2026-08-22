-- Content fingerprint for practical import/upload dedupe
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "content_hash" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_user_content_hash_uidx"
  ON "media" USING btree ("user_id","content_hash")
  WHERE "content_hash" is not null;
