ALTER TABLE "model_runs" DROP CONSTRAINT "model_runs_purpose";--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "type" text DEFAULT 'language' NOT NULL;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_purpose" CHECK ("model_runs"."purpose" in ('chat', 'describe', 'title', 'compact', 'task', 'memory', 'decide'));--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_type" CHECK ("models"."type" in ('language', 'evaluation'));