CREATE TABLE "catalog_items" (
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_tools" text[],
	"approval_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_mode" text DEFAULT 'shared' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health" jsonb,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"proxy_id" uuid,
	"proxy_mode" text DEFAULT 'auto' NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'mcp' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_key_unique" UNIQUE("key"),
	CONSTRAINT "catalog_items_type" CHECK ("catalog_items"."type" in ('mcp')),
	CONSTRAINT "catalog_items_credential_mode" CHECK ("catalog_items"."credential_mode" in ('shared', 'per_user')),
	CONSTRAINT "catalog_items_proxy_mode" CHECK ("catalog_items"."proxy_mode" in ('auto', 'direct', 'proxy'))
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"catalog_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_error" text,
	"last_used_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "connections_user_catalog" UNIQUE("user_id","catalog_id"),
	CONSTRAINT "connections_status" CHECK ("connections"."status" in ('active', 'needs_reauth', 'error'))
);
--> statement-breakpoint
CREATE TABLE "oauth_flows" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"owner_type" text NOT NULL,
	"return_to" text NOT NULL,
	"state" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "oauth_flows_owner_type" CHECK ("oauth_flows"."owner_type" in ('catalog_item', 'connection'))
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_proxy_id_proxies_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."proxies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_catalog_id_catalog_items_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_flows" ADD CONSTRAINT "oauth_flows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_flows_created_at" ON "oauth_flows" USING btree ("created_at");