DROP INDEX "mba"."messages_chat_occurred_at_idx";--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD COLUMN "channel_id" bigint;--> statement-breakpoint
UPDATE "mba"."chats" AS "chat"
SET "channel_id" = COALESCE(
	(SELECT "contact"."channel_id" FROM "mba"."contacts" AS "contact" WHERE "contact"."id" = "chat"."contact_id"),
	(SELECT "group"."channel_id" FROM "mba"."groups" AS "group" WHERE "group"."id" = "chat"."group_id")
);--> statement-breakpoint
ALTER TABLE "mba"."chats" ALTER COLUMN "channel_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mba"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_channel_updated_id_idx" ON "mba"."chats" USING btree ("channel_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "messages_chat_occurred_id_idx" ON "mba"."messages" USING btree ("chat_id","occurred_at","id");
