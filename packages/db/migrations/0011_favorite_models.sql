CREATE TABLE "favorite_models" (
	"model_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "favorite_models_user_id_model_id_pk" PRIMARY KEY("user_id","model_id")
);
--> statement-breakpoint
ALTER TABLE "favorite_models" ADD CONSTRAINT "favorite_models_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_models" ADD CONSTRAINT "favorite_models_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;