CREATE TABLE "model_runs" (
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"chat_id" uuid,
	"cost" numeric(14, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"model_id" uuid,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"user_id" text,
	CONSTRAINT "model_runs_status" CHECK ("model_runs"."status" in ('ok', 'error', 'aborted'))
);
--> statement-breakpoint
CREATE TABLE "models" (
	"capabilities" jsonb NOT NULL,
	"capabilities_source" text DEFAULT 'discovered' NOT NULL,
	"context_window" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_access" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"price_cached" numeric(14, 6),
	"price_currency" text,
	"price_input" numeric(14, 6),
	"price_output" numeric(14, 6),
	"provider_id" uuid NOT NULL,
	"released_at" date,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_for_titles" boolean DEFAULT false NOT NULL,
	CONSTRAINT "models_source_model" UNIQUE("source_id","model_id"),
	CONSTRAINT "models_capabilities_source" CHECK ("models"."capabilities_source" in ('discovered', 'seed', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logo" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health" jsonb,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"logo" text,
	"options" jsonb NOT NULL,
	"base_url" text,
	"proxy_id" uuid,
	"proxy_mode" text DEFAULT 'auto' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_kind" CHECK ("sources"."kind" in ('openai', 'anthropic', 'openai-compatible', 'yandex', 'gateway')),
	CONSTRAINT "sources_proxy_mode" CHECK ("sources"."proxy_mode" in ('auto', 'direct', 'proxy'))
);
--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_runs_user_time" ON "model_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "model_runs_model_time" ON "model_runs" USING btree ("model_id","created_at");--> statement-breakpoint
CREATE INDEX "models_provider" ON "models" USING btree ("provider_id");