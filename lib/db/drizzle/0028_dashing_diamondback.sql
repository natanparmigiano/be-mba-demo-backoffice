ALTER TABLE "mba"."channels" ADD COLUMN "name" text;
UPDATE "mba"."channels" SET "name" = "wa_phone_number" WHERE "name" IS NULL;
ALTER TABLE "mba"."channels" ALTER COLUMN "name" SET NOT NULL;
