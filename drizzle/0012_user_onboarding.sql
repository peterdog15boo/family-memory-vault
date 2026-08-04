ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL;
