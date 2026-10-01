ALTER TABLE "runner"."execution_logs" DROP CONSTRAINT "execution_logs_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" DROP CONSTRAINT "execution_logs_function_id_functions_id_fk";
--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" DROP CONSTRAINT "execution_logs_revision_id_function_revisions_id_fk";
--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" DROP CONSTRAINT "execution_logs_api_key_id_function_api_keys_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "function_api_keys_id_function_id_uidx" ON "runner"."function_api_keys" USING btree ("id","function_id");--> statement-breakpoint
CREATE UNIQUE INDEX "function_revisions_id_function_id_uidx" ON "runner"."function_revisions" USING btree ("id","function_id");--> statement-breakpoint
CREATE UNIQUE INDEX "functions_id_organization_id_uidx" ON "runner"."functions" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_function_organization_fk" FOREIGN KEY ("function_id","organization_id") REFERENCES "runner"."functions"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_revision_function_fk" FOREIGN KEY ("revision_id","function_id") REFERENCES "runner"."function_revisions"("id","function_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_api_key_function_fk" FOREIGN KEY ("api_key_id","function_id") REFERENCES "runner"."function_api_keys"("id","function_id") ON DELETE restrict ON UPDATE no action;
