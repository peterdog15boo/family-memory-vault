CREATE TYPE "public"."memory_box_payment_status" AS ENUM(
  'unpaid',
  'checkout_pending',
  'paid',
  'manual_follow_up'
);
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ADD COLUMN "payment_status" "memory_box_payment_status" DEFAULT 'unpaid' NOT NULL;
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ADD COLUMN "stripe_checkout_session_id" text;
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ADD COLUMN "stripe_payment_intent_id" text;
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ADD COLUMN "paid_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "memory_box_orders_payment_status_idx"
  ON "memory_box_orders" USING btree ("payment_status");
--> statement-breakpoint
CREATE UNIQUE INDEX "memory_box_orders_stripe_session_uidx"
  ON "memory_box_orders" USING btree ("stripe_checkout_session_id");
