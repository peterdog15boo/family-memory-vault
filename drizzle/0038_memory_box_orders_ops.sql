-- Align Memory Box orders with ops fields: requested status, price, customer_notes.

ALTER TYPE "public"."memory_box_order_status" RENAME VALUE 'submitted' TO 'requested';
--> statement-breakpoint
ALTER TABLE "memory_box_orders" RENAME COLUMN "special_instructions" TO "customer_notes";
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ALTER COLUMN "status" SET DEFAULT 'requested';
--> statement-breakpoint
ALTER TABLE "memory_box_orders"
  ADD COLUMN "price_cents" integer DEFAULT 19900 NOT NULL;
