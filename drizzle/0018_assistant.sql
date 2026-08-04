CREATE TYPE "public"."assistant_message_role" AS ENUM('user', 'assistant', 'system');
--> statement-breakpoint
CREATE TYPE "public"."assistant_action_type" AS ENUM('create_memory', 'create_movie', 'search_media', 'clarify');
--> statement-breakpoint
CREATE TYPE "public"."assistant_action_status" AS ENUM('pending', 'succeeded', 'failed', 'needs_clarification');
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "role" "assistant_message_role" NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "message_id" text,
  "user_id" text NOT NULL,
  "action_type" "assistant_action_type" NOT NULL,
  "status" "assistant_action_status" DEFAULT 'pending' NOT NULL,
  "intent" jsonb,
  "result" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_conversations"
  ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assistant_messages"
  ADD CONSTRAINT "assistant_messages_conversation_id_assistant_conversations_id_fk"
  FOREIGN KEY ("conversation_id")
  REFERENCES "public"."assistant_conversations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assistant_actions"
  ADD CONSTRAINT "assistant_actions_conversation_id_assistant_conversations_id_fk"
  FOREIGN KEY ("conversation_id")
  REFERENCES "public"."assistant_conversations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assistant_actions"
  ADD CONSTRAINT "assistant_actions_message_id_assistant_messages_id_fk"
  FOREIGN KEY ("message_id")
  REFERENCES "public"."assistant_messages"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assistant_actions"
  ADD CONSTRAINT "assistant_actions_user_id_users_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_id_idx" ON "assistant_conversations" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_updated_idx" ON "assistant_conversations" USING btree ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_id_idx" ON "assistant_messages" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_created_idx" ON "assistant_messages" USING btree ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX "assistant_actions_conversation_id_idx" ON "assistant_actions" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "assistant_actions_user_id_idx" ON "assistant_actions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "assistant_actions_user_created_idx" ON "assistant_actions" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "assistant_actions_message_id_idx" ON "assistant_actions" USING btree ("message_id");
