CREATE TABLE "mba"."sticker_library" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."sticker_library_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sticker_library_byte_size_check" CHECK ("mba"."sticker_library"."byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "mba"."sticker_library" ADD CONSTRAINT "sticker_library_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sticker_library_storage_path_uidx" ON "mba"."sticker_library" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "sticker_library_organization_sha256_uidx" ON "mba"."sticker_library" USING btree ("organization_id","sha256");--> statement-breakpoint
CREATE INDEX "sticker_library_organization_created_id_idx" ON "mba"."sticker_library" USING btree ("organization_id","created_at","id");