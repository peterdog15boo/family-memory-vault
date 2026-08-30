ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "name_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;
