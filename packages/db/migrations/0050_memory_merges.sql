CREATE TABLE "memory_merges" (
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"gone_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"keep_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"sealed" text NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memory_dismissals" ALTER COLUMN "record_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "memory_merges" ADD CONSTRAINT "memory_merges_gone_id_memory_entities_id_fk" FOREIGN KEY ("gone_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merges" ADD CONSTRAINT "memory_merges_keep_id_memory_entities_id_fk" FOREIGN KEY ("keep_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merges" ADD CONSTRAINT "memory_merges_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_merges_owner" ON "memory_merges" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_merged_into_memory_entities_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."memory_entities"("id") ON DELETE set null ON UPDATE no action;