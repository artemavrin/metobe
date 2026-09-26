CREATE TABLE "model_slots" (
	"model_id" uuid,
	"slot" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_runs" ADD COLUMN "purpose" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "model_slots" ADD CONSTRAINT "model_slots_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" DROP COLUMN "used_for_titles";--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_purpose" CHECK ("model_runs"."purpose" in ('chat', 'title'));