CREATE SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."chat_events" SET SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."chats" SET SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."contacts" SET SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."groups" SET SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."message_status_events" SET SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."messages" SET SCHEMA "chats";
--> statement-breakpoint
ALTER TABLE "mba"."sticker_library" SET SCHEMA "chats";
