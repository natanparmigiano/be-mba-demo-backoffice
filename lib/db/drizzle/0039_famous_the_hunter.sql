ALTER TABLE "mba"."chats" ADD COLUMN "handoff_at" timestamp with time zone;--> statement-breakpoint
UPDATE "mba"."chats"
SET "handoff_at" = "updated_at"
WHERE "handled_by" = 'application';--> statement-breakpoint
CREATE INDEX "chats_queue_idx" ON "mba"."chats" USING btree ("organization_id","handled_by","assigned_user_id","handoff_at");
