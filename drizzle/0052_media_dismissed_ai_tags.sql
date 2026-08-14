ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "dismissed_ai_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
