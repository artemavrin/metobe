CREATE TABLE "chats" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	CONSTRAINT "chats_kind" CHECK ("chats"."kind" in ('chat', 'agent_run')),
	CONSTRAINT "chats_visibility" CHECK ("chats"."visibility" in ('private', 'public'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chat_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"parts" jsonb NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "messages_role" CHECK ("messages"."role" in ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"chat_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"chat_id" uuid NOT NULL,
	"is_upvoted" boolean NOT NULL,
	"message_id" uuid NOT NULL,
	CONSTRAINT "votes_chat_id_message_id_pk" PRIMARY KEY("chat_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_user_updated" ON "chats" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_chat_time" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "streams_chat" ON "streams" USING btree ("chat_id");--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;