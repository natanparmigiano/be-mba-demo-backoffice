CREATE SCHEMA "files";
--> statement-breakpoint
CREATE TABLE "files"."__files" (
	"path" text PRIMARY KEY NOT NULL,
	"blob" "bytea" NOT NULL,
	"content_type" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "__files_path_length_check" CHECK (octet_length("files"."__files"."path") BETWEEN 1 AND 1024)
);
