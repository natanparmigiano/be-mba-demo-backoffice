ALTER TABLE "mba"."messages" ADD COLUMN "is_marketing_template" boolean;
--> statement-breakpoint
UPDATE "mba"."messages"
SET "is_marketing_template" = false
WHERE "direction" = 'outbound'
  AND "template_name" IS NOT NULL;
