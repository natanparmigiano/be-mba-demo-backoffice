ALTER TABLE "mba"."chats" ADD COLUMN "handled_by" text DEFAULT 'application' NOT NULL;--> statement-breakpoint
UPDATE "mba"."chats" AS "chat"
SET "handled_by" = CASE
	WHEN "latest"."source" = 'standby' THEN 'mba'
	ELSE 'application'
END
FROM (
	SELECT DISTINCT ON ("message"."chat_id")
		"message"."chat_id",
		"message"."source"
	FROM "mba"."messages" AS "message"
	WHERE "message"."source" IN ('messages', 'standby')
	ORDER BY
		"message"."chat_id",
		coalesce("message"."occurred_at", "message"."received_at") DESC,
		"message"."id" DESC
) AS "latest"
WHERE "chat"."id" = "latest"."chat_id";
