CREATE UNIQUE INDEX "channels_id_organization_uidx" ON "mba"."channels" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_id_channel_uidx" ON "mba"."contacts" USING btree ("id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_id_channel_uidx" ON "mba"."groups" USING btree ("id","channel_id");--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_channel_organization_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "mba"."channels"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_contact_channel_fk" FOREIGN KEY ("contact_id","channel_id") REFERENCES "mba"."contacts"("id","channel_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_group_channel_fk" FOREIGN KEY ("group_id","channel_id") REFERENCES "mba"."groups"("id","channel_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" DROP CONSTRAINT "chats_channel_id_channels_id_fk";--> statement-breakpoint
ALTER TABLE "mba"."chats" DROP CONSTRAINT "chats_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "mba"."chats" DROP CONSTRAINT "chats_contact_id_contacts_id_fk";--> statement-breakpoint
ALTER TABLE "mba"."chats" DROP CONSTRAINT "chats_group_id_groups_id_fk";
