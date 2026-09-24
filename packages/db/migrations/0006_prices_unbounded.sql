ALTER TABLE "model_runs" ALTER COLUMN "cost" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "models" ALTER COLUMN "price_input" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "models" ALTER COLUMN "price_output" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "model_runs" DROP COLUMN "cached_tokens";--> statement-breakpoint
ALTER TABLE "models" DROP COLUMN "price_cached";