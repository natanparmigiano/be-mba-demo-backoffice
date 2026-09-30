ALTER TABLE "mba"."channels" ADD COLUMN "wa_webhook_verify_token" text;--> statement-breakpoint
UPDATE "mba"."channels"
SET "wa_webhook_verify_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "wa_webhook_verify_token" IS NULL;--> statement-breakpoint
ALTER TABLE "mba"."channels" ALTER COLUMN "wa_webhook_verify_token" SET NOT NULL;
