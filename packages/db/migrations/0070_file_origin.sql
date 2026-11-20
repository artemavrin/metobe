ALTER TABLE "files" DROP CONSTRAINT "files_kind";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "origin" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_origin" CHECK ("files"."origin" in ('upload', 'generated'));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_kind" CHECK ("files"."kind" in ('image', 'pdf', 'text', 'doc', 'sheet', 'other'));