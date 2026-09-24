CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"purpose" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_id" text NOT NULL,
	"hint" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "secrets_owner_purpose" UNIQUE("owner_type","owner_id","purpose")
);
--> statement-breakpoint
CREATE INDEX "secrets_key_id" ON "secrets" USING btree ("key_id");