CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "mba";
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth"."sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"domain_verified" boolean,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "auth"."team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"membership_key" text,
	"created_at" timestamp,
	CONSTRAINT "team_member_membership_key_unique" UNIQUE("membership_key")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "mba"."channels" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."channels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"agent_id" text NOT NULL,
	"wa_phone_number" text NOT NULL,
	"wa_phone_number_id" text NOT NULL,
	"wa_waba_id" text NOT NULL,
	"wa_business_id" text NOT NULL,
	"wa_app_id" text NOT NULL,
	"wa_app_secret" text NOT NULL,
	"wa_system_user_access_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mba"."chat_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."chat_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chat_id" bigint NOT NULL,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"provider_event_id" text,
	"deduplication_key" text NOT NULL,
	"provider_event_type" text,
	"provider_conversation_id" text,
	"actor_contact_id" bigint,
	"agent_id" text,
	"agent_name" text,
	"previous_owner" text,
	"new_owner" text,
	"billing_conversation_id" text,
	"billing_conversation_expires_at" timestamp with time zone,
	"billing_conversation_origin" text,
	"pricing_billable" boolean,
	"pricing_model" text,
	"pricing_category" text,
	"pricing_type" text,
	"provider_timestamp" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"webhook_entry_time" timestamp with time zone,
	"raw_event" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mba"."chats" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."chats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"contact_id" bigint,
	"group_id" bigint,
	"latest_message_id" bigint,
	"latest_read_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_identity_check" CHECK (("mba"."chats"."kind" = 'direct' and "mba"."chats"."contact_id" is not null and "mba"."chats"."group_id" is null) or ("mba"."chats"."kind" = 'group' and "mba"."chats"."contact_id" is null and "mba"."chats"."group_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "mba"."contacts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" bigint NOT NULL,
	"wa_id" text,
	"user_id" text,
	"parent_user_id" text,
	"identity_key_hash" text,
	"input" text,
	"profile_name" text,
	"profile_username" text,
	"raw_contact" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mba"."groups" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" bigint NOT NULL,
	"provider_group_id" text NOT NULL,
	"subject" text,
	"description" text,
	"invite_link" text,
	"join_approval_mode" text,
	"last_webhook_field" text,
	"last_event_type" text,
	"last_event_at" timestamp with time zone,
	"raw_group" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mba"."message_status_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."message_status_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"message_id" bigint NOT NULL,
	"status" text NOT NULL,
	"provider_timestamp" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recipient_id" text,
	"recipient_user_id" text,
	"recipient_parent_user_id" text,
	"recipient_type" text,
	"recipient_participant_id" text,
	"recipient_identity_key_hash" text,
	"biz_opaque_callback_data" text,
	"billing_conversation_id" text,
	"billing_conversation_expires_at" timestamp with time zone,
	"billing_conversation_origin" text,
	"pricing_billable" boolean,
	"pricing_model" text,
	"pricing_category" text,
	"pricing_type" text,
	"errors" jsonb,
	"raw_status" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mba"."messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chat_id" bigint NOT NULL,
	"contact_id" bigint,
	"client_message_id" text,
	"provider_message_id" text,
	"source" text NOT NULL,
	"direction" text NOT NULL,
	"message_type" text,
	"interactive_type" text,
	"dispatch_status" text,
	"sender_phone" text,
	"sender_user_id" text,
	"sender_parent_user_id" text,
	"recipient_id" text,
	"recipient_user_id" text,
	"recipient_parent_user_id" text,
	"recipient_type" text,
	"recipient_participant_id" text,
	"recipient_identity_key_hash" text,
	"provider_timestamp" text,
	"occurred_at" timestamp with time zone,
	"webhook_entry_time" timestamp with time zone,
	"context_message_id" text,
	"target_message_id" text,
	"raw_message" jsonb,
	"send_response" jsonb,
	"status" text,
	"status_provider_timestamp" text,
	"status_occurred_at" timestamp with time zone,
	"status_updated_at" timestamp with time zone,
	"biz_opaque_callback_data" text,
	"billing_conversation_id" text,
	"billing_conversation_expires_at" timestamp with time zone,
	"billing_conversation_origin" text,
	"pricing_billable" boolean,
	"pricing_model" text,
	"pricing_category" text,
	"pricing_type" text,
	"status_errors" jsonb,
	"raw_status" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."channels" ADD CONSTRAINT "channels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chat_events" ADD CONSTRAINT "chat_events_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "mba"."chats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chat_events" ADD CONSTRAINT "chat_events_actor_contact_id_contacts_id_fk" FOREIGN KEY ("actor_contact_id") REFERENCES "mba"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "mba"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "mba"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_latest_message_id_messages_id_fk" FOREIGN KEY ("latest_message_id") REFERENCES "mba"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."chats" ADD CONSTRAINT "chats_latest_read_message_id_messages_id_fk" FOREIGN KEY ("latest_read_message_id") REFERENCES "mba"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."contacts" ADD CONSTRAINT "contacts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mba"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."groups" ADD CONSTRAINT "groups_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mba"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."message_status_events" ADD CONSTRAINT "message_status_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "mba"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "mba"."chats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mba"."messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "mba"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "auth"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "auth"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "auth"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "auth"."member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "auth"."team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "auth"."team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "auth"."team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_type_wa_phone_number_id_uidx" ON "mba"."channels" USING btree ("type","wa_phone_number_id");--> statement-breakpoint
CREATE INDEX "channels_agent_id_idx" ON "mba"."channels" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "channels_organization_id_idx" ON "mba"."channels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_events_deduplication_key_uidx" ON "mba"."chat_events" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "chat_events_chat_occurred_id_idx" ON "mba"."chat_events" USING btree ("chat_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "chat_events_chat_type_occurred_idx" ON "mba"."chat_events" USING btree ("chat_id","event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "chat_events_provider_event_id_idx" ON "mba"."chat_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "chat_events_actor_occurred_idx" ON "mba"."chat_events" USING btree ("actor_contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "chat_events_billing_conversation_id_idx" ON "mba"."chat_events" USING btree ("billing_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_contact_uidx" ON "mba"."chats" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_group_uidx" ON "mba"."chats" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "chats_latest_message_id_idx" ON "mba"."chats" USING btree ("latest_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_channel_wa_id_uidx" ON "mba"."contacts" USING btree ("channel_id","wa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_channel_user_id_uidx" ON "mba"."contacts" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "contacts_channel_profile_name_idx" ON "mba"."contacts" USING btree ("channel_id","profile_name");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_channel_provider_group_uidx" ON "mba"."groups" USING btree ("channel_id","provider_group_id");--> statement-breakpoint
CREATE INDEX "groups_channel_subject_idx" ON "mba"."groups" USING btree ("channel_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "message_status_events_delivery_uidx" ON "mba"."message_status_events" USING btree ("message_id","status","provider_timestamp");--> statement-breakpoint
CREATE INDEX "message_status_events_message_occurred_at_idx" ON "mba"."message_status_events" USING btree ("message_id","occurred_at");--> statement-breakpoint
CREATE INDEX "message_status_events_status_occurred_at_idx" ON "mba"."message_status_events" USING btree ("status","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_message_id_uidx" ON "mba"."messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_chat_client_message_id_uidx" ON "mba"."messages" USING btree ("chat_id","client_message_id");--> statement-breakpoint
CREATE INDEX "messages_chat_occurred_at_idx" ON "mba"."messages" USING btree ("chat_id","occurred_at");--> statement-breakpoint
CREATE INDEX "messages_contact_occurred_at_idx" ON "mba"."messages" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "messages_sender_occurred_at_idx" ON "mba"."messages" USING btree ("sender_phone","occurred_at");--> statement-breakpoint
CREATE INDEX "messages_target_message_id_idx" ON "mba"."messages" USING btree ("target_message_id");--> statement-breakpoint
CREATE INDEX "messages_status_occurred_at_idx" ON "mba"."messages" USING btree ("status","status_occurred_at");