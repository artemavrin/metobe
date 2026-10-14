CREATE TABLE "skill_files" (
	"content" text NOT NULL,
	"path" text NOT NULL,
	"size" integer NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "skill_files_skill_id_path_pk" PRIMARY KEY("skill_id","path")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructions" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_shared_name" ON "skills" USING btree ("name") WHERE "skills"."owner_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_owner_name" ON "skills" USING btree ("owner_id","name") WHERE "skills"."owner_id" is not null;--> statement-breakpoint
CREATE INDEX "skills_owner" ON "skills" USING btree ("owner_id");