CREATE TABLE "files" (
	"chat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "files_kind" CHECK ("files"."kind" in ('image', 'pdf', 'text', 'doc', 'sheet'))
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_user" ON "files" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "files_chat" ON "files" USING btree ("chat_id");