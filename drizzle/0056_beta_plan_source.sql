ALTER TABLE "subscriptions" ADD COLUMN "plan_source" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "plan_assigned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "subscriptions_plan_source_idx" ON "subscriptions" USING btree ("plan_source");
