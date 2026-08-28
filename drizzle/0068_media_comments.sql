-- Family-only comment thread under Photos library media.

CREATE TABLE IF NOT EXISTS "media_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "media_id" text NOT NULL REFERENCES "media"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "edited_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "media_comments_media_id_created_at_idx"
  ON "media_comments" ("media_id", "created_at");
CREATE INDEX IF NOT EXISTS "media_comments_user_id_idx"
  ON "media_comments" ("user_id");
