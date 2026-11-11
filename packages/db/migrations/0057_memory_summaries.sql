CREATE TABLE "memory_summaries" (
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"covers_at" timestamp with time zone NOT NULL,
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"sealed" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_summaries" ADD CONSTRAINT "memory_summaries_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_summaries" ADD CONSTRAINT "memory_summaries_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_summaries_owner" ON "memory_summaries" USING btree ("owner_id");