ALTER TABLE "sources" ADD COLUMN "local" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Sources already there: local when their address is this machine or a private network, as new ones are marked.
UPDATE "sources" SET "local" = true WHERE "base_url" ~* '^[a-z]+://(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[::1\]|[^/:@]+\.local([:/]|$))';
