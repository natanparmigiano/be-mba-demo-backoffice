CREATE SCHEMA "studio";
--> statement-breakpoint
CREATE TABLE "studio"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"file_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_file_path_unique" UNIQUE("file_path")
);
--> statement-breakpoint
ALTER TABLE "studio"."projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_organization_last_opened_idx" ON "studio"."projects" USING btree ("organization_id","last_opened_at");--> statement-breakpoint
CREATE INDEX "projects_organization_name_idx" ON "studio"."projects" USING btree ("organization_id","name");