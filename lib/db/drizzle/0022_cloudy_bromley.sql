CREATE TABLE "mba"."agent_backups" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."agent_backups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"channel_id" bigint NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_backups_byte_size_check" CHECK ("mba"."agent_backups"."byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "mba"."agent_backups" ADD CONSTRAINT "agent_backups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."agent_backups" ADD CONSTRAINT "agent_backups_channel_organization_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "mba"."channels"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_backups_storage_path_uidx" ON "mba"."agent_backups" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "agent_backups_channel_created_id_idx" ON "mba"."agent_backups" USING btree ("channel_id","created_at","id");