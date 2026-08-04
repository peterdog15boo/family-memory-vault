CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx" ON "admin_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actor_id_idx" ON "admin_audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_idx" ON "admin_audit_logs" ("target_type", "target_id");
