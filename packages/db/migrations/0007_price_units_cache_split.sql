ALTER TABLE "model_runs" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "model_runs" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "price_cache_read" numeric;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "price_cache_write" numeric;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "price_unit_tokens" integer;