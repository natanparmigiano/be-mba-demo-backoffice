CREATE SCHEMA "runner";
--> statement-breakpoint
CREATE TABLE "runner"."execution_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runner"."execution_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"function_id" bigint NOT NULL,
	"revision_id" bigint NOT NULL,
	"api_key_id" bigint,
	"status" text DEFAULT 'running' NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "execution_logs_duration_nonnegative_check" CHECK ("runner"."execution_logs"."duration_ms" IS NULL OR "runner"."execution_logs"."duration_ms" >= 0),
	CONSTRAINT "execution_logs_terminal_state_check" CHECK (("runner"."execution_logs"."status" = 'running' AND "runner"."execution_logs"."finished_at" IS NULL AND "runner"."execution_logs"."duration_ms" IS NULL) OR ("runner"."execution_logs"."status" <> 'running' AND "runner"."execution_logs"."finished_at" IS NOT NULL AND "runner"."execution_logs"."duration_ms" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "runner"."function_api_keys" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runner"."function_api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"function_id" bigint NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "function_api_keys_expiration_after_creation_check" CHECK ("runner"."function_api_keys"."expires_at" > "runner"."function_api_keys"."created_at")
);
--> statement-breakpoint
CREATE TABLE "runner"."function_revisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runner"."function_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"function_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "function_revisions_revision_positive_check" CHECK ("runner"."function_revisions"."revision" > 0),
	CONSTRAINT "function_revisions_code_not_empty_check" CHECK (length("runner"."function_revisions"."code") > 0)
);
--> statement-breakpoint
CREATE TABLE "runner"."functions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runner"."functions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "functions_current_revision_positive_check" CHECK ("runner"."functions"."current_revision" > 0),
	CONSTRAINT "functions_archive_state_check" CHECK (("runner"."functions"."status" = 'active' AND "runner"."functions"."archived_at" IS NULL) OR ("runner"."functions"."status" = 'archived' AND "runner"."functions"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "runner"."revision_parameters" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runner"."revision_parameters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"revision_id" bigint NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"description" text,
	CONSTRAINT "revision_parameters_position_nonnegative_check" CHECK ("runner"."revision_parameters"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "runner"."functions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_revision_id_function_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "runner"."function_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."execution_logs" ADD CONSTRAINT "execution_logs_api_key_id_function_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "runner"."function_api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" ADD CONSTRAINT "function_api_keys_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "runner"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."function_revisions" ADD CONSTRAINT "function_revisions_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "runner"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."functions" ADD CONSTRAINT "functions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."revision_parameters" ADD CONSTRAINT "revision_parameters_revision_id_function_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "runner"."function_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_logs_organization_id_started_at_idx" ON "runner"."execution_logs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "execution_logs_function_id_started_at_idx" ON "runner"."execution_logs" USING btree ("function_id","started_at");--> statement-breakpoint
CREATE INDEX "execution_logs_revision_id_idx" ON "runner"."execution_logs" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "execution_logs_api_key_id_idx" ON "runner"."execution_logs" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "function_api_keys_key_hash_uidx" ON "runner"."function_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "function_api_keys_function_id_idx" ON "runner"."function_api_keys" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "function_api_keys_expires_at_idx" ON "runner"."function_api_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "function_revisions_function_id_revision_uidx" ON "runner"."function_revisions" USING btree ("function_id","revision");--> statement-breakpoint
CREATE INDEX "function_revisions_function_id_idx" ON "runner"."function_revisions" USING btree ("function_id");--> statement-breakpoint
CREATE UNIQUE INDEX "functions_organization_id_name_uidx" ON "runner"."functions" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "functions_organization_id_status_idx" ON "runner"."functions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_parameters_revision_id_name_uidx" ON "runner"."revision_parameters" USING btree ("revision_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_parameters_revision_id_position_uidx" ON "runner"."revision_parameters" USING btree ("revision_id","position");--> statement-breakpoint
CREATE INDEX "revision_parameters_revision_id_idx" ON "runner"."revision_parameters" USING btree ("revision_id");