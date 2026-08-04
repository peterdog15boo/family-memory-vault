ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
