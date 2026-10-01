ALTER TABLE "mba"."chats" ADD COLUMN "unread_message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "mba"."chats" AS "chat"
SET "unread_message_count" = "unread"."message_count"
FROM (
	SELECT "message"."chat_id", count(*)::integer AS "message_count"
	FROM "mba"."messages" AS "message"
	INNER JOIN "mba"."chats" AS "chat_cursor" ON "chat_cursor"."id" = "message"."chat_id"
	WHERE "message"."direction" = 'inbound'
		AND ("chat_cursor"."latest_read_message_id" IS NULL OR "message"."id" > "chat_cursor"."latest_read_message_id")
	GROUP BY "message"."chat_id"
) AS "unread"
WHERE "unread"."chat_id" = "chat"."id";--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_unread_message_count_check" CHECK ("mba"."chats"."unread_message_count" >= 0);
