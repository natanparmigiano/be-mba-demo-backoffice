CREATE SCHEMA "stats";
--> statement-breakpoint
CREATE TABLE "stats"."events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stats"."events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_key" text NOT NULL,
	"organization_id" text NOT NULL,
	"channel_id" bigint NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" bigint,
	"event_type" text NOT NULL,
	"team_id" text,
	"user_id" text,
	"duration_ms" integer,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stats_events_duration_nonnegative_check" CHECK ("stats"."events"."duration_ms" is null or "stats"."events"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stats"."events" ADD CONSTRAINT "events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats"."events" ADD CONSTRAINT "events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "chats"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats"."events" ADD CONSTRAINT "events_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "chats"."chats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats"."events" ADD CONSTRAINT "events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chats"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stats_events_event_key_uidx" ON "stats"."events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "stats_events_organization_channel_occurred_idx" ON "stats"."events" USING btree ("organization_id","channel_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stats_events_team_occurred_idx" ON "stats"."events" USING btree ("organization_id","team_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stats_events_user_occurred_idx" ON "stats"."events" USING btree ("organization_id","user_id","occurred_at");