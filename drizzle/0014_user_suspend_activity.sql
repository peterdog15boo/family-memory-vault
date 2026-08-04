ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_at" timestamptz;
CREATE INDEX IF NOT EXISTS "users_suspended_at_idx" ON "users" ("suspended_at");
CREATE INDEX IF NOT EXISTS "users_last_active_at_idx" ON "users" ("last_active_at");
