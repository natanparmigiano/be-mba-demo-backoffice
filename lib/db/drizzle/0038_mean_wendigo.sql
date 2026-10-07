ALTER TABLE "mba"."chats" ADD COLUMN "assigned_team_id" text;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD COLUMN "assigned_user_id" text;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_assigned_team_id_team_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "auth"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_assigned_team_id_idx" ON "mba"."chats" USING btree ("assigned_team_id");--> statement-breakpoint
CREATE INDEX "chats_assigned_user_id_idx" ON "mba"."chats" USING btree ("assigned_user_id");