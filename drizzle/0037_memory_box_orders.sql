CREATE TYPE "public"."memory_box_order_status" AS ENUM(
  'submitted',
  'box_shipped',
  'box_received',
  'processing',
  'completed',
  'cancelled'
);
--> statement-breakpoint
CREATE TABLE "memory_box_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "address_line1" text NOT NULL,
  "address_line2" text,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "postal_code" text NOT NULL,
  "country" text DEFAULT 'US' NOT NULL,
  "estimated_photos" integer DEFAULT 0 NOT NULL,
  "estimated_video_tapes" integer DEFAULT 0 NOT NULL,
  "estimated_film_reels" integer DEFAULT 0 NOT NULL,
  "other_items_notes" text,
  "special_instructions" text,
  "estimates_acknowledged" boolean NOT NULL,
  "status" "memory_box_order_status" DEFAULT 'submitted' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ADD CONSTRAINT "memory_box_orders_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "memory_box_orders_email_idx" ON "memory_box_orders" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "memory_box_orders_status_idx" ON "memory_box_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "memory_box_orders_created_at_idx" ON "memory_box_orders" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "memory_box_orders_user_id_idx" ON "memory_box_orders" USING btree ("user_id");
