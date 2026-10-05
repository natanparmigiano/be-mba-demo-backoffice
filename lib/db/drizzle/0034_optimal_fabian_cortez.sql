CREATE SCHEMA "kv";
--> statement-breakpoint
CREATE TABLE "kv"."entries" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "entries_expires_at_idx" ON "kv"."entries" USING btree ("expires_at");