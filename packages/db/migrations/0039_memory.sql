CREATE TABLE "memory_entities" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"sealed" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"write_id" uuid,
	CONSTRAINT "memory_entities_kind" CHECK ("memory_entities"."kind" in ('self', 'person', 'org', 'project'))
);
--> statement-breakpoint
CREATE TABLE "memory_keys" (
	"auth_tag" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"iv" text NOT NULL,
	"key_id" text NOT NULL,
	"owner_id" text PRIMARY KEY NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memory_record_entities" (
	"entity_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "memory_record_entities_record_id_entity_id_role_pk" PRIMARY KEY("record_id","entity_id","role"),
	CONSTRAINT "memory_record_entities_role" CHECK ("memory_record_entities"."role" in ('about', 'participant', 'debtor', 'creditor', 'subject'))
);
--> statement-breakpoint
CREATE TABLE "memory_records" (
	"closed_by_write" uuid,
	"deleted_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"given_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"occurred_precision" text,
	"owner_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sealed" text NOT NULL,
	"status" text,
	"superseded_at" timestamp with time zone,
	"superseded_by" uuid,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"write_id" uuid,
	CONSTRAINT "memory_records_kind" CHECK ("memory_records"."kind" in ('fact', 'assessment', 'event', 'commitment', 'rule')),
	CONSTRAINT "memory_records_precision" CHECK (("memory_records"."occurred_at" is null) = ("memory_records"."occurred_precision" is null)
          and ("memory_records"."occurred_precision" is null or "memory_records"."occurred_precision" in ('day', 'week', 'month', 'year'))),
	CONSTRAINT "memory_records_status" CHECK (("memory_records"."kind" = 'commitment') = ("memory_records"."status" is not null)
          and ("memory_records"."status" is null or "memory_records"."status" in ('open', 'done')))
);
--> statement-breakpoint
CREATE TABLE "memory_writes" (
	"chat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	CONSTRAINT "memory_writes_status" CHECK ("memory_writes"."status" in ('queued', 'skipped', 'done', 'failed', 'undone'))
);
--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_write_id_memory_writes_id_fk" FOREIGN KEY ("write_id") REFERENCES "public"."memory_writes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_keys" ADD CONSTRAINT "memory_keys_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_record_entities" ADD CONSTRAINT "memory_record_entities_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_record_entities" ADD CONSTRAINT "memory_record_entities_record_id_memory_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_closed_by_write_memory_writes_id_fk" FOREIGN KEY ("closed_by_write") REFERENCES "public"."memory_writes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_write_id_memory_writes_id_fk" FOREIGN KEY ("write_id") REFERENCES "public"."memory_writes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_writes" ADD CONSTRAINT "memory_writes_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_writes" ADD CONSTRAINT "memory_writes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_entities_owner" ON "memory_entities" USING btree ("owner_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_entities_self" ON "memory_entities" USING btree ("owner_id") WHERE "memory_entities"."kind" = 'self';--> statement-breakpoint
CREATE INDEX "memory_record_entities_entity" ON "memory_record_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "memory_records_owner_kind" ON "memory_records" USING btree ("owner_id","kind") WHERE "memory_records"."superseded_at" is null and "memory_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "memory_records_due" ON "memory_records" USING btree ("owner_id","due_at") WHERE "memory_records"."status" = 'open' and "memory_records"."superseded_at" is null and "memory_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "memory_records_occurred" ON "memory_records" USING btree ("owner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "memory_records_write" ON "memory_records" USING btree ("write_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_writes_message" ON "memory_writes" USING btree ("owner_id","message_id");