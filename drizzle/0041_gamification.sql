CREATE TYPE "public"."achievement_category" AS ENUM('photos', 'memories', 'family', 'legacy');
--> statement-breakpoint
CREATE TABLE "achievement_definitions" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "category" "achievement_category" NOT NULL,
  "threshold" integer NOT NULL,
  "lp_reward" integer DEFAULT 0 NOT NULL,
  "badge_image" text,
  "unlock_feature" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "achievement_id" text NOT NULL,
  "family_id" text,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "family_id" text,
  "photo_count" integer DEFAULT 0 NOT NULL,
  "memory_count" integer DEFAULT 0 NOT NULL,
  "family_members_count" integer DEFAULT 0 NOT NULL,
  "legacy_score" integer DEFAULT 0 NOT NULL,
  "total_lp" integer DEFAULT 0 NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
  "streak_days" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_progress" (
  "family_id" text PRIMARY KEY NOT NULL,
  "total_photos" integer DEFAULT 0 NOT NULL,
  "total_memories" integer DEFAULT 0 NOT NULL,
  "active_members" integer DEFAULT 0 NOT NULL,
  "average_legacy_score" integer DEFAULT 0 NOT NULL,
  "vault_level" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_achievements"
  ADD CONSTRAINT "user_achievements_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_achievements"
  ADD CONSTRAINT "user_achievements_achievement_id_achievement_definitions_id_fk"
  FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement_definitions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_achievements"
  ADD CONSTRAINT "user_achievements_family_id_families_id_fk"
  FOREIGN KEY ("family_id") REFERENCES "public"."families"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_progress"
  ADD CONSTRAINT "user_progress_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_progress"
  ADD CONSTRAINT "user_progress_family_id_families_id_fk"
  FOREIGN KEY ("family_id") REFERENCES "public"."families"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "family_progress"
  ADD CONSTRAINT "family_progress_family_id_families_id_fk"
  FOREIGN KEY ("family_id") REFERENCES "public"."families"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_definitions_key_uidx"
  ON "achievement_definitions" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "achievement_definitions_category_idx"
  ON "achievement_definitions" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "achievement_definitions_sort_order_idx"
  ON "achievement_definitions" USING btree ("category", "sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_user_achievement_uidx"
  ON "user_achievements" USING btree ("user_id", "achievement_id");
--> statement-breakpoint
CREATE INDEX "user_achievements_user_id_idx"
  ON "user_achievements" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_achievements_family_id_idx"
  ON "user_achievements" USING btree ("family_id");
--> statement-breakpoint
CREATE INDEX "user_achievements_unlocked_at_idx"
  ON "user_achievements" USING btree ("unlocked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_progress_user_id_uidx"
  ON "user_progress" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_progress_family_id_idx"
  ON "user_progress" USING btree ("family_id");
--> statement-breakpoint
CREATE INDEX "user_progress_level_idx"
  ON "user_progress" USING btree ("level");
--> statement-breakpoint
CREATE INDEX "family_progress_vault_level_idx"
  ON "family_progress" USING btree ("vault_level");
