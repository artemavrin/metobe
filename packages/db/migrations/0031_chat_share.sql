ALTER TABLE "chats" DROP CONSTRAINT "chats_visibility";--> statement-breakpoint
-- Nothing ever wrote «public»; should a row hold it all the same, it goes back to its owner only, not to everyone.
UPDATE "chats" SET "visibility" = 'private' WHERE "visibility" NOT IN ('private', 'team');--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_visibility" CHECK ("chats"."visibility" in ('private', 'team'));
