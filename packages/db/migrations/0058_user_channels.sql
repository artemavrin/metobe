CREATE TABLE "user_channels" (
	"chat_id" text,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"last_error" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "user_channels_user_kind" UNIQUE("user_id","kind"),
	CONSTRAINT "user_channels_kind_chat" UNIQUE("kind","chat_id"),
	CONSTRAINT "user_channels_kind" CHECK ("user_channels"."kind" in ('telegram')),
	CONSTRAINT "user_channels_status" CHECK ("user_channels"."status" in ('pending', 'active', 'error'))
);
--> statement-breakpoint
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;