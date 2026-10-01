ALTER TABLE "mba"."chats" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "mba"."chats" AS "chat"
SET "organization_id" = "channel"."organization_id"
FROM "mba"."channels" AS "channel"
WHERE "channel"."id" = "chat"."channel_id";--> statement-breakpoint
ALTER TABLE "mba"."chats" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_channel_id_idx" ON "mba"."chats" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "chats_organization_updated_id_idx" ON "mba"."chats" USING btree ("organization_id","updated_at","id");--> statement-breakpoint
DROP INDEX "mba"."chats_channel_updated_id_idx";
