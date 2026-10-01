ALTER TABLE "mba"."messages" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "mba"."messages"
SET "ai_generated" = true
WHERE
  "source" = 'message_echo'
  AND jsonb_typeof("raw_message" -> 'message') = 'object';
