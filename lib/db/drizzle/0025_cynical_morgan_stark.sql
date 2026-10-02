ALTER TABLE "mba"."messages" ADD COLUMN "template_name" text;
--> statement-breakpoint
UPDATE "mba"."messages"
SET "template_name" = "template_data" ->> 'name'
WHERE "direction" = 'outbound'
  AND jsonb_typeof("template_data" -> 'name') = 'string';
