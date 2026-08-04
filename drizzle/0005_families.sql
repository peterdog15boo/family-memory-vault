CREATE TYPE "public"."family_member_role" AS ENUM('owner', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."family_member_status" AS ENUM('pending', 'active', 'declined', 'removed');--> statement-breakpoint
CREATE TABLE "families" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"user_id" text,
	"role" "family_member_role" DEFAULT 'member' NOT NULL,
	"status" "family_member_status" DEFAULT 'pending' NOT NULL,
	"invited_email" text NOT NULL,
	"invite_token" text,
	"invited_by_user_id" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "families_created_by_user_id_idx" ON "families" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "families_name_idx" ON "families" USING btree ("name");--> statement-breakpoint
CREATE INDEX "family_members_family_id_idx" ON "family_members" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "family_members_user_id_idx" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "family_members_invited_email_idx" ON "family_members" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "family_members_family_status_idx" ON "family_members" USING btree ("family_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_invite_token_uidx" ON "family_members" USING btree ("invite_token");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_family_user_uidx" ON "family_members" USING btree ("family_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_family_email_uidx" ON "family_members" USING btree ("family_id","invited_email");
