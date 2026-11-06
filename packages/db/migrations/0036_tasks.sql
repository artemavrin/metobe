CREATE TABLE "task_runs" (
	"chat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome" text,
	"resolved_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'queued' NOT NULL,
	"summary" text,
	"task_id" uuid NOT NULL,
	"task_version" integer NOT NULL,
	"trigger" text NOT NULL,
	CONSTRAINT "task_runs_status" CHECK ("task_runs"."status" in ('queued', 'running', 'waiting_approval', 'done', 'failed', 'cancelled')),
	CONSTRAINT "task_runs_outcome" CHECK ("task_runs"."outcome" is null or "task_runs"."outcome" in ('news', 'quiet', 'question', 'action')),
	CONSTRAINT "task_runs_trigger" CHECK ("task_runs"."trigger" in ('schedule', 'manual', 'test'))
);
--> statement-breakpoint
CREATE TABLE "task_versions" (
	"changed_by" text,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request" text,
	"snapshot" jsonb NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"catalog_ids" jsonb,
	"chat_id" uuid,
	"color" text NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cron" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructions" text NOT NULL,
	"max_steps" integer DEFAULT 20 NOT NULL,
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"next_run_at" timestamp with time zone,
	"notify_email" boolean DEFAULT false NOT NULL,
	"owner_id" text NOT NULL,
	"paused_reason" text,
	"report_when" text DEFAULT 'changes' NOT NULL,
	"timeout_s" integer DEFAULT 600 NOT NULL,
	"timezone" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tasks_report_when" CHECK ("tasks"."report_when" in ('changes', 'always'))
);
--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_kind";--> statement-breakpoint
ALTER TABLE "model_runs" DROP CONSTRAINT "model_runs_purpose";--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_runs_task_time" ON "task_runs" USING btree ("task_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "task_runs_task_due" ON "task_runs" USING btree ("task_id","scheduled_for","trigger");--> statement-breakpoint
CREATE UNIQUE INDEX "task_versions_task_version" ON "task_versions" USING btree ("task_id","version");--> statement-breakpoint
CREATE INDEX "tasks_owner" ON "tasks" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_due" ON "tasks" USING btree ("next_run_at") WHERE "tasks"."enabled";--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_kind" CHECK ("chats"."kind" in ('chat', 'task_run'));--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_purpose" CHECK ("model_runs"."purpose" in ('chat', 'describe', 'title', 'compact', 'task'));