-- Family tree nodes (People-linked or label-only placeholders) + relationships
CREATE TABLE IF NOT EXISTS "family_tree_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"person_id" text,
	"label" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "family_tree_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_tree_nodes" ADD CONSTRAINT "family_tree_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_tree_nodes" ADD CONSTRAINT "family_tree_nodes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_tree_relationships" ADD CONSTRAINT "family_tree_relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_tree_relationships" ADD CONSTRAINT "family_tree_relationships_from_node_id_family_tree_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."family_tree_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_tree_relationships" ADD CONSTRAINT "family_tree_relationships_to_node_id_family_tree_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."family_tree_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_tree_nodes_user_id_idx" ON "family_tree_nodes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_tree_nodes_person_id_idx" ON "family_tree_nodes" USING btree ("person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_tree_nodes_user_person_uidx" ON "family_tree_nodes" USING btree ("user_id","person_id") WHERE "person_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_tree_rels_user_id_idx" ON "family_tree_relationships" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_tree_rels_from_idx" ON "family_tree_relationships" USING btree ("from_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_tree_rels_to_idx" ON "family_tree_relationships" USING btree ("to_node_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_tree_rels_edge_uidx" ON "family_tree_relationships" USING btree ("user_id","from_node_id","to_node_id","type");
