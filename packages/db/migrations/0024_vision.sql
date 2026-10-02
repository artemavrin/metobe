ALTER TABLE "model_runs" DROP CONSTRAINT "model_runs_purpose";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_purpose" CHECK ("model_runs"."purpose" in ('chat', 'describe', 'title'));