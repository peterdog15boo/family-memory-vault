ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "user_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
