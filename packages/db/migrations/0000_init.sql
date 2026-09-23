CREATE TABLE "system_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"policies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_canary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_singleton" CHECK ("system_settings"."id" = 1)
);
