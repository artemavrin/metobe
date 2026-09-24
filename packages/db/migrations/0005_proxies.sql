CREATE TABLE "proxies" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health" jsonb,
	"host" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"port" integer NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	CONSTRAINT "proxies_type" CHECK ("proxies"."type" in ('http', 'https', 'socks5', 'socks5h')),
	CONSTRAINT "proxies_port" CHECK ("proxies"."port" between 1 and 65535)
);
--> statement-breakpoint
CREATE TABLE "proxy_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"proxy_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proxy_domains" ADD CONSTRAINT "proxy_domains_proxy_id_proxies_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."proxies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_proxy_id_proxies_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."proxies"("id") ON DELETE set null ON UPDATE no action;