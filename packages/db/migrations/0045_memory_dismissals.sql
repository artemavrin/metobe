CREATE TABLE "memory_dismissals" (
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"owner_id" text NOT NULL,
	"record_id" uuid PRIMARY KEY NOT NULL,
	"status" text
);
--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_record_id_memory_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_dismissals_owner" ON "memory_dismissals" USING btree ("owner_id");