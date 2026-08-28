-- Human Story posts about a person (family feed). AI notes stay on people.story_*.

CREATE TABLE IF NOT EXISTS "person_story_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "person_id" text NOT NULL REFERENCES "people"("id") ON DELETE cascade,
  "author_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "edited_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "person_story_posts_person_id_created_at_idx"
  ON "person_story_posts" ("person_id", "created_at");
CREATE INDEX IF NOT EXISTS "person_story_posts_author_user_id_idx"
  ON "person_story_posts" ("author_user_id");
