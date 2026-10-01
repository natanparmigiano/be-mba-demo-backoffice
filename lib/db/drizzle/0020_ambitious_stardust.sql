CREATE TABLE "runner"."mcp_functions" (
	"mcp_id" bigint NOT NULL,
	"function_id" bigint NOT NULL,
	"organization_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_functions_pkey" PRIMARY KEY("mcp_id","function_id"),
	CONSTRAINT "mcp_functions_position_nonnegative_check" CHECK ("runner"."mcp_functions"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "runner"."mcps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runner"."mcps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runner"."function_api_keys" ADD COLUMN "allowed_mcp_ids" bigint[];--> statement-breakpoint
CREATE UNIQUE INDEX "mcps_id_organization_id_uidx" ON "runner"."mcps" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "runner"."mcp_functions" ADD CONSTRAINT "mcp_functions_mcp_organization_fk" FOREIGN KEY ("mcp_id","organization_id") REFERENCES "runner"."mcps"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."mcp_functions" ADD CONSTRAINT "mcp_functions_function_organization_fk" FOREIGN KEY ("function_id","organization_id") REFERENCES "runner"."functions"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."mcps" ADD CONSTRAINT "mcps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_functions_mcp_id_position_uidx" ON "runner"."mcp_functions" USING btree ("mcp_id","position");--> statement-breakpoint
CREATE INDEX "mcp_functions_function_id_idx" ON "runner"."mcp_functions" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "mcp_functions_organization_id_idx" ON "runner"."mcp_functions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcps_organization_id_name_uidx" ON "runner"."mcps" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "mcps_organization_id_updated_at_idx" ON "runner"."mcps" USING btree ("organization_id","updated_at");
