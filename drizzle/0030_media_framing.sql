ALTER TABLE "media" ADD COLUMN "focal_point_x" double precision;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "focal_point_y" double precision;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "subject_bounds" jsonb;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "framing_updated_at" timestamp with time zone;
