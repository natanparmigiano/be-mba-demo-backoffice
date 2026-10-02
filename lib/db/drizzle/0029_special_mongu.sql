CREATE TABLE "runner"."agent_mcp_connectors" (
	"channel_id" bigint NOT NULL,
	"mcp_id" bigint NOT NULL,
	"connector_id" text NOT NULL,
	"api_key_id" bigint NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_mcp_connectors_pkey" PRIMARY KEY("channel_id","mcp_id")
);
--> statement-breakpoint
ALTER TABLE "runner"."agent_mcp_connectors" ADD CONSTRAINT "agent_mcp_connectors_channel_organization_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "mba"."channels"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."agent_mcp_connectors" ADD CONSTRAINT "agent_mcp_connectors_mcp_organization_fk" FOREIGN KEY ("mcp_id","organization_id") REFERENCES "runner"."mcps"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner"."agent_mcp_connectors" ADD CONSTRAINT "agent_mcp_connectors_api_key_organization_fk" FOREIGN KEY ("api_key_id","organization_id") REFERENCES "runner"."function_api_keys"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_mcp_connectors_channel_connector_uidx" ON "runner"."agent_mcp_connectors" USING btree ("channel_id","connector_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_connectors_mcp_id_idx" ON "runner"."agent_mcp_connectors" USING btree ("mcp_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_connectors_api_key_id_idx" ON "runner"."agent_mcp_connectors" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_connectors_organization_id_idx" ON "runner"."agent_mcp_connectors" USING btree ("organization_id");