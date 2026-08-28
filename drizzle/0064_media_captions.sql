ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "caption" text;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "caption_updated_at" timestamp with time zone;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "caption_updated_by_user_id" text;
DO $$ BEGIN
  ALTER TABLE "media"
    ADD CONSTRAINT "media_caption_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("caption_updated_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
