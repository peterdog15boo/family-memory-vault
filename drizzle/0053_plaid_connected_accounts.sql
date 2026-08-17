CREATE TYPE "public"."plaid_item_status" AS ENUM('active', 'error', 'disconnected');--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plaid_item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"access_token_encrypted" text NOT NULL,
	"status" "plaid_item_status" DEFAULT 'active' NOT NULL,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plaid_item_id" text NOT NULL,
	"plaid_account_id" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"mask" text,
	"current_balance" double precision,
	"available_balance" double precision,
	"iso_currency_code" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "linked_account_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"linked_account_id" text NOT NULL,
	"plaid_security_id" text,
	"name" text NOT NULL,
	"ticker_symbol" text,
	"quantity" double precision,
	"institution_value" double precision,
	"institution_price" double precision,
	"iso_currency_code" text,
	"as_of" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_account_holdings" ADD CONSTRAINT "linked_account_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_account_holdings" ADD CONSTRAINT "linked_account_holdings_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_items_plaid_item_id_uidx" ON "plaid_items" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "plaid_items_user_id_idx" ON "plaid_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plaid_items_user_status_idx" ON "plaid_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_plaid_account_uidx" ON "linked_accounts" USING btree ("plaid_account_id");--> statement-breakpoint
CREATE INDEX "linked_accounts_user_id_idx" ON "linked_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linked_accounts_item_idx" ON "linked_accounts" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "linked_account_holdings_user_id_idx" ON "linked_account_holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linked_account_holdings_account_idx" ON "linked_account_holdings" USING btree ("linked_account_id");
