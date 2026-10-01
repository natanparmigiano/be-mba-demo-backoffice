CREATE TABLE "mba"."agent_knowledge_file_archives" (
	"organization_id" text NOT NULL,
	"provider_file_id" text NOT NULL,
	"storage_path" text NOT NULL,
	CONSTRAINT "agent_knowledge_file_archives_pk" PRIMARY KEY("organization_id","provider_file_id")
);
--> statement-breakpoint
ALTER TABLE "mba"."agent_knowledge_file_archives" ADD CONSTRAINT "agent_knowledge_file_archives_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_knowledge_file_archives_storage_path_uidx" ON "mba"."agent_knowledge_file_archives" USING btree ("storage_path");