CREATE TABLE "mailboxes" (
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imap" jsonb NOT NULL,
	"last_error" text,
	"last_used_at" timestamp with time zone,
	"preset" text NOT NULL,
	"smtp" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	CONSTRAINT "mailboxes_user_address" UNIQUE("user_id","address"),
	CONSTRAINT "mailboxes_status" CHECK ("mailboxes"."status" in ('active', 'needs_reauth', 'error'))
);
--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailboxes_user" ON "mailboxes" USING btree ("user_id");