ALTER TABLE "runner"."execution_logs" DROP CONSTRAINT "execution_logs_api_key_function_fk";
--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" DROP CONSTRAINT "function_api_keys_function_id_functions_id_fk";
--> statement-breakpoint
DROP INDEX "runner"."function_api_keys_id_function_id_uidx";--> statement-breakpoint
DROP INDEX "runner"."function_api_keys_function_id_idx";--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" ADD COLUMN "allowed_function_ids" bigint[];--> statement-breakpoint
UPDATE "runner"."function_api_keys" AS "api_key"
SET
  "organization_id" = "function"."organization_id",
  "allowed_function_ids" = ARRAY["api_key"."function_id"]::bigint[]
FROM "runner"."functions" AS "function"
WHERE "function"."id" = "api_key"."function_id";--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" ADD CONSTRAINT "function_api_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "function_api_keys_id_organization_id_uidx" ON "runner"."function_api_keys" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "function_api_keys_organization_id_idx" ON "runner"."function_api_keys" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_api_key_organization_fk" FOREIGN KEY ("api_key_id","organization_id") REFERENCES "runner"."function_api_keys"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" DROP COLUMN "function_id";
