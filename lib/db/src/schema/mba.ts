import type {
  WhatsAppOutboundMessage,
  WhatsAppSendMessageResponse,
} from '@mba-demo/schemas/wa-cloud/messages'
import type {
  Call,
  CallStatus,
  GroupUpdate,
  HistoryMessage,
  MessageEcho,
  MessagingHandoverEvent,
  UserPreference,
  WebhookError,
  WhatsAppContact,
  WhatsAppMessage as WhatsAppInboundMessage,
  WhatsAppMessageStatus as WhatsAppWebhookMessageStatus,
} from '@mba-demo/schemas/wa-cloud/webhooks'
import { sql } from 'drizzle-orm'
import { organization } from './auth.js'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const mbaSchema = pgSchema('mba')

export const whatsappMessageDirections = ['inbound', 'outbound'] as const
export const whatsappMessageSources = [
  'history',
  'message_echo',
  'messages',
  'outbound_api',
  'standby',
  'status',
] as const
export const whatsappMessageTypes = [
  'audio',
  'button',
  'contacts',
  'document',
  'edit',
  'image',
  'interactive',
  'location',
  'order',
  'reaction',
  'revoke',
  'sticker',
  'system',
  'template',
  'text',
  'unknown',
  'unsupported',
  'video',
] as const
export const whatsappInteractiveTypes = [
  'button',
  'button_reply',
  'call_permission_reply',
  'catalog_message',
  'flow',
  'list',
  'list_reply',
  'nfm_reply',
  'product',
  'product_list',
] as const
export const whatsappDispatchStatuses = [
  'accepted',
  'failed',
  'queued',
  'sending',
  'unknown',
] as const
export const whatsappMessageStatuses = [
  'deleted',
  'delivered',
  'failed',
  'played',
  'read',
  'sent',
] as const
export const whatsappRecipientTypes = ['group', 'individual'] as const
export const whatsappConversationOrigins = [
  'authentication',
  'marketing',
  'referral_conversion',
  'service',
  'utility',
] as const
// Add `instagram` and `messenger` after their provider-specific fields and ingestion paths exist.
export const channelTypes = ['whatsapp'] as const
export const chatKinds = ['direct', 'group'] as const
export const whatsappGroupWebhookFields = [
  'group_lifecycle_update',
  'group_participants_update',
  'group_settings_update',
  'group_status_update',
] as const
export const chatEventTypes = [
  'agent_event',
  'billing_window_opened',
  'call',
  'call_status',
  'group_lifecycle',
  'group_participants',
  'group_settings',
  'group_status',
  'handover',
  'other',
  'user_preference',
] as const
export const chatEventSources = [
  'calls',
  'group_lifecycle_update',
  'group_participants_update',
  'group_settings_update',
  'group_status_update',
  'messages',
  'messaging_handovers',
  'user_preferences',
] as const

export type WhatsAppMessageDirection =
  (typeof whatsappMessageDirections)[number]
export type WhatsAppMessageSource = (typeof whatsappMessageSources)[number]
export type WhatsAppMessageType = (typeof whatsappMessageTypes)[number]
export type WhatsAppInteractiveType = (typeof whatsappInteractiveTypes)[number]
export type WhatsAppDispatchStatus = (typeof whatsappDispatchStatuses)[number]
export type WhatsAppMessageStatus = (typeof whatsappMessageStatuses)[number]
export type WhatsAppRecipientType = (typeof whatsappRecipientTypes)[number]
export type WhatsAppConversationOrigin =
  (typeof whatsappConversationOrigins)[number]
export type ChannelType = (typeof channelTypes)[number]
export type ChatKind = (typeof chatKinds)[number]
export type WhatsAppGroupWebhookField =
  (typeof whatsappGroupWebhookFields)[number]
export type ChatEventType = (typeof chatEventTypes)[number]
export type ChatEventSource = (typeof chatEventSources)[number]

export type StoredWhatsAppMessagePayload =
  | HistoryMessage
  | MessageEcho
  | WhatsAppInboundMessage
  | WhatsAppOutboundMessage

type SendResponseContact = WhatsAppSendMessageResponse['contacts'][number]
export type StoredWhatsAppContact = SendResponseContact | WhatsAppContact
export type StoredChatEventPayload =
  | Call
  | CallStatus
  | GroupUpdate
  | MessagingHandoverEvent
  | UserPreference
  | WhatsAppWebhookMessageStatus

export const channels = mbaSchema.table(
  'channels',
  {
    // Internal channel identifier used by webhook routes and all channel-owned records.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Owning Better Auth organization; every channel is tenant-scoped and cannot outlive its organization.
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    // Provider discriminator; only WhatsApp is supported until Instagram and Messenger are modeled.
    type: text('type', { enum: channelTypes }).notNull(),
    // WhatsApp phone number in display/dialable form, corresponding to webhook `metadata.display_phone_number`.
    waPhoneNumber: text('wa_phone_number').notNull(),
    // Meta phone-number ID used by Cloud API calls and webhook `metadata.phone_number_id`.
    waPhoneNumberId: text('wa_phone_number_id').notNull(),
    // WhatsApp Business Account ID corresponding to webhook envelope `entry[].id`.
    waWabaId: text('wa_waba_id').notNull(),
    // Meta Business Portfolio ID that owns the WhatsApp Business Account.
    waBusinessId: text('wa_business_id').notNull(),
    // Meta application ID used to configure and verify this channel's webhook integration.
    waAppId: text('wa_app_id').notNull(),
    // Sensitive Meta application secret used for webhook HMAC validation; never expose or log it.
    waAppSecret: text('wa_app_secret').notNull(),
    // Per-channel secret presented by Meta during the webhook subscription verification challenge.
    waWebhookVerifyToken: text('wa_webhook_verify_token').notNull(),
    // Sensitive system-user token used for Cloud API calls; never expose or log it.
    waSystemUserAccessToken: text('wa_system_user_access_token').notNull(),
    // Time this channel configuration was created in the application.
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Time this channel configuration was most recently changed.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('channels_type_wa_phone_number_id_uidx').on(
      table.type,
      table.waPhoneNumberId,
    ),
    index('channels_organization_id_idx').on(table.organizationId),
  ],
)

export const contacts = mbaSchema.table(
  'contacts',
  {
    // Internal contact row identifier; this value is not supplied by Meta.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Internal channel selected by `/api/wa-cloud/webhook/:id`; scopes Meta contact identifiers.
    channelId: bigint('channel_id', { mode: 'number' })
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    // WhatsApp identifier from `value.contacts[].wa_id` or send-response `contacts[].wa_id`.
    waId: text('wa_id'),
    // Meta user identifier from `value.contacts[].user_id`, when supplied.
    userId: text('user_id'),
    // Parent Meta user identifier from `value.contacts[].parent_user_id`, when supplied.
    parentUserId: text('parent_user_id'),
    // Identity-key hash from `value.contacts[].identity_key_hash`, used for identity correlation.
    identityKeyHash: text('identity_key_hash'),
    // Original recipient input from a send response's `contacts[].input`.
    input: text('input'),
    // Display name from `value.contacts[].profile.name`.
    profileName: text('profile_name'),
    // Optional username from `value.contacts[].profile.username`.
    profileUsername: text('profile_username'),
    // Complete typed `value.contacts[]` or send-response `contacts[]` object for lossless storage.
    rawContact: jsonb('raw_contact').$type<StoredWhatsAppContact>().notNull(),
    // Time this application first observed the contact; no equivalent Meta webhook field exists.
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Time this application most recently observed the contact in a webhook or send response.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('contacts_channel_wa_id_uidx').on(table.channelId, table.waId),
    uniqueIndex('contacts_channel_user_id_uidx').on(
      table.channelId,
      table.userId,
    ),
    index('contacts_channel_profile_name_idx').on(
      table.channelId,
      table.profileName,
    ),
  ],
)

export const groups = mbaSchema.table(
  'groups',
  {
    // Internal group identifier; this value is not supplied by Meta.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Internal channel selected by `/api/wa-cloud/webhook/:id`; scopes Meta group identifiers.
    channelId: bigint('channel_id', { mode: 'number' })
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    // Stable Meta group identity from messages' `group_id` and group updates' `groups[].group_id`.
    providerGroupId: text('provider_group_id').notNull(),
    // Current group title projected from `groups[].subject`.
    subject: text('subject'),
    // Current group description projected from `groups[].description`.
    description: text('description'),
    // Current group invitation URL projected from `groups[].invite_link`.
    inviteLink: text('invite_link'),
    // Current group join policy projected from `groups[].join_approval_mode`.
    joinApprovalMode: text('join_approval_mode'),
    // Outer webhook field that delivered the latest group event.
    lastWebhookField: text('last_webhook_field', {
      enum: whatsappGroupWebhookFields,
    }),
    // Open-ended event action from `groups[].type`; Meta does not publish a closed value set.
    lastEventType: text('last_event_type'),
    // Parsed time represented by the latest `groups[].timestamp`.
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    // Complete latest typed `groups[]` event, including participants, actor, request, and errors.
    rawGroup: jsonb('raw_group').$type<GroupUpdate>(),
    // Time this application first observed the group in a message or group webhook.
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Time this application's durable group projection was most recently changed.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('groups_channel_provider_group_uidx').on(
      table.channelId,
      table.providerGroupId,
    ),
    index('groups_channel_subject_idx').on(table.channelId, table.subject),
  ],
)

export const chats = mbaSchema.table(
  'chats',
  {
    // Internal eternal chat identifier; this value is not supplied by Meta.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Application discriminator derived from a message's `group_id` or its remote contact.
    kind: text('kind', { enum: chatKinds }).notNull(),
    // Sole remote participant for a direct chat; null for group chats.
    contactId: bigint('contact_id', { mode: 'number' }).references(
      () => contacts.id,
      { onDelete: 'restrict' },
    ),
    // Internal `mba.groups` identity for a group chat; null for direct chats.
    groupId: bigint('group_id', { mode: 'number' }).references(
      () => groups.id,
      { onDelete: 'restrict' },
    ),
    // Denormalized pointer to the newest message in this chat for cursor and range lookups.
    latestMessageId: bigint('latest_message_id', {
      mode: 'number',
    }).references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
    // Application read cursor; unlike Meta's delivery status, this tracks the newest locally read message.
    latestReadMessageId: bigint('latest_read_message_id', {
      mode: 'number',
    }).references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
    // Time this application first discovered the chat from a message or group webhook.
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Time this application's durable chat projection was most recently changed.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('chats_contact_uidx').on(table.contactId),
    uniqueIndex('chats_group_uidx').on(table.groupId),
    index('chats_latest_message_id_idx').on(table.latestMessageId),
    check(
      'chats_identity_check',
      sql`(${table.kind} = 'direct' and ${table.contactId} is not null and ${table.groupId} is null) or (${table.kind} = 'group' and ${table.contactId} is null and ${table.groupId} is not null)`,
    ),
  ],
)

export const messages = mbaSchema.table(
  'messages',
  {
    // Internal message row identifier; this value is not supplied by Meta.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Eternal chat resolved from the remote contact or the message's `group_id`.
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => chats.id, { onDelete: 'restrict' }),
    // Resolved `mba.contacts` row for `value.contacts[]` or send-response `contacts[]` data.
    contactId: bigint('contact_id', { mode: 'number' }).references(
      () => contacts.id,
      { onDelete: 'set null' },
    ),
    // Application-assigned outbound idempotency key; webhook-created rows do not provide it.
    clientMessageId: text('client_message_id'),
    // Meta message ID from `messages[].id`, `statuses[].id`, or send-response `messages[].id`.
    providerMessageId: text('provider_message_id'),
    // Ingestion variant that identifies the webhook collection or outbound API that produced the row.
    source: text('source', { enum: whatsappMessageSources }).notNull(),
    // Application-derived flow direction: received webhook message or submitted outbound message.
    direction: text('direction', {
      enum: whatsappMessageDirections,
    }).notNull(),
    // Message discriminator from inbound `messages[].type` or outbound request `type`.
    messageType: text('message_type', { enum: whatsappMessageTypes }),
    // Interactive discriminator from inbound/outbound `interactive.type`, when applicable.
    interactiveType: text('interactive_type', {
      enum: whatsappInteractiveTypes,
    }),
    // Local outbound lifecycle state; distinct from delivery status webhooks in `statuses[].status`.
    dispatchStatus: text('dispatch_status', {
      enum: whatsappDispatchStatuses,
    }),
    // Sender phone/WhatsApp ID from inbound `messages[].from`.
    senderPhone: text('sender_phone'),
    // Sender user ID from inbound `messages[].from_user_id`, when supplied.
    senderUserId: text('sender_user_id'),
    // Sender parent-user ID from inbound `messages[].from_parent_user_id`, when supplied.
    senderParentUserId: text('sender_parent_user_id'),
    // Outbound `to` value or status webhook `statuses[].recipient_id`.
    recipientId: text('recipient_id'),
    // Recipient user ID from `statuses[].recipient_user_id`, when supplied.
    recipientUserId: text('recipient_user_id'),
    // Recipient parent-user ID from `statuses[].recipient_parent_user_id`, when supplied.
    recipientParentUserId: text('recipient_parent_user_id'),
    // Recipient kind from `statuses[].recipient_type`; absent means an individual in legacy payloads.
    recipientType: text('recipient_type', {
      enum: whatsappRecipientTypes,
    }),
    // Group participant ID from `statuses[].recipient_participant_id`.
    recipientParticipantId: text('recipient_participant_id'),
    // Group recipient identity hash from `statuses[].recipient_identity_key_hash`.
    recipientIdentityKeyHash: text('recipient_identity_key_hash'),
    // Original Unix timestamp string from inbound `messages[].timestamp`.
    providerTimestamp: text('provider_timestamp'),
    // Parsed timestamp represented by `provider_timestamp`, for ordering and range queries.
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    // Parsed webhook envelope `entry[].time`, when that envelope provides it.
    webhookEntryTime: timestamp('webhook_entry_time', { withTimezone: true }),
    // Replied-to message from inbound `messages[].context.id` or outbound `context.message_id`.
    contextMessageId: text('context_message_id'),
    // Message affected by reaction/edit/revoke content, such as `reaction.message_id`.
    targetMessageId: text('target_message_id'),
    // Complete typed inbound message, history/echo message, or outbound send request.
    rawMessage: jsonb('raw_message').$type<StoredWhatsAppMessagePayload>(),
    // Complete typed Graph API response returned after an outbound message submission.
    sendResponse: jsonb('send_response').$type<WhatsAppSendMessageResponse>(),
    // Latest delivery state from `statuses[].status`; maintained from status webhooks.
    status: text('status', { enum: whatsappMessageStatuses }),
    // Original Unix timestamp string from the latest `statuses[].timestamp`.
    statusProviderTimestamp: text('status_provider_timestamp'),
    // Parsed time represented by the latest `statuses[].timestamp`.
    statusOccurredAt: timestamp('status_occurred_at', { withTimezone: true }),
    // Application time when the latest status webhook was applied to this row.
    statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }),
    // Business callback value echoed by Meta as `statuses[].biz_opaque_callback_data`.
    bizOpaqueCallbackData: text('biz_opaque_callback_data'),
    // Meta billing-window identifier from `statuses[].conversation.id`; not the internal chat FK.
    billingConversationId: text('billing_conversation_id'),
    // Parsed `statuses[].conversation.expiration_timestamp`, when supplied.
    billingConversationExpiresAt: timestamp('billing_conversation_expires_at', {
      withTimezone: true,
    }),
    // Conversation category from `statuses[].conversation.origin.type`.
    billingConversationOrigin: text('billing_conversation_origin', {
      enum: whatsappConversationOrigins,
    }),
    // Billing flag from `statuses[].pricing.billable`.
    pricingBillable: boolean('pricing_billable'),
    // Pricing model from `statuses[].pricing.pricing_model`; Meta does not publish a closed value set.
    pricingModel: text('pricing_model'),
    // Pricing category from `statuses[].pricing.category`; kept as raw text for forward compatibility.
    pricingCategory: text('pricing_category'),
    // Pricing subtype from `statuses[].pricing.type`; kept as raw text for forward compatibility.
    pricingType: text('pricing_type'),
    // Structured failures from the latest `statuses[].errors` array.
    statusErrors: jsonb('status_errors').$type<WebhookError[]>(),
    // Complete latest typed `statuses[]` object for fields not promoted to columns.
    rawStatus: jsonb('raw_status').$type<WhatsAppWebhookMessageStatus>(),
    // Application ingestion time for the initial webhook or outbound request.
    receivedAt: timestamp('received_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Application time of the most recent message or status-driven row update.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('messages_provider_message_id_uidx').on(
      table.providerMessageId,
    ),
    uniqueIndex('messages_chat_client_message_id_uidx').on(
      table.chatId,
      table.clientMessageId,
    ),
    index('messages_chat_occurred_at_idx').on(table.chatId, table.occurredAt),
    index('messages_contact_occurred_at_idx').on(
      table.contactId,
      table.occurredAt,
    ),
    index('messages_sender_occurred_at_idx').on(
      table.senderPhone,
      table.occurredAt,
    ),
    index('messages_target_message_id_idx').on(table.targetMessageId),
    index('messages_status_occurred_at_idx').on(
      table.status,
      table.statusOccurredAt,
    ),
  ],
)

export const messageStatusEvents = mbaSchema.table(
  'message_status_events',
  {
    // Internal immutable status-event row identifier; this value is not supplied by Meta.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Message resolved by matching `statuses[].id` to `messages.provider_message_id`.
    messageId: bigint('message_id', { mode: 'number' })
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    // Delivery state from `statuses[].status`.
    status: text('status', { enum: whatsappMessageStatuses }).notNull(),
    // Original Unix timestamp string from `statuses[].timestamp`.
    providerTimestamp: text('provider_timestamp').notNull(),
    // Parsed time represented by `statuses[].timestamp`.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    // Recipient WhatsApp ID from `statuses[].recipient_id`.
    recipientId: text('recipient_id'),
    // Recipient user ID from `statuses[].recipient_user_id`, when supplied.
    recipientUserId: text('recipient_user_id'),
    // Recipient parent-user ID from `statuses[].recipient_parent_user_id`, when supplied.
    recipientParentUserId: text('recipient_parent_user_id'),
    // Recipient kind from `statuses[].recipient_type`; absent means an individual in legacy payloads.
    recipientType: text('recipient_type', {
      enum: whatsappRecipientTypes,
    }),
    // Group participant ID from `statuses[].recipient_participant_id`.
    recipientParticipantId: text('recipient_participant_id'),
    // Group recipient identity hash from `statuses[].recipient_identity_key_hash`.
    recipientIdentityKeyHash: text('recipient_identity_key_hash'),
    // Business callback value echoed as `statuses[].biz_opaque_callback_data`.
    bizOpaqueCallbackData: text('biz_opaque_callback_data'),
    // Meta billing-window identifier from `statuses[].conversation.id`.
    billingConversationId: text('billing_conversation_id'),
    // Parsed `statuses[].conversation.expiration_timestamp`, when supplied.
    billingConversationExpiresAt: timestamp('billing_conversation_expires_at', {
      withTimezone: true,
    }),
    // Conversation category from `statuses[].conversation.origin.type`.
    billingConversationOrigin: text('billing_conversation_origin', {
      enum: whatsappConversationOrigins,
    }),
    // Billing flag from `statuses[].pricing.billable`.
    pricingBillable: boolean('pricing_billable'),
    // Pricing model from `statuses[].pricing.pricing_model`; the contract leaves values open.
    pricingModel: text('pricing_model'),
    // Pricing category from `statuses[].pricing.category`; kept as raw provider text.
    pricingCategory: text('pricing_category'),
    // Pricing subtype from `statuses[].pricing.type`; kept as raw provider text.
    pricingType: text('pricing_type'),
    // Structured failures from `statuses[].errors` for this exact delivery event.
    errors: jsonb('errors').$type<WebhookError[]>(),
    // Complete typed `statuses[]` object, preserving the original event losslessly.
    rawStatus: jsonb('raw_status')
      .$type<WhatsAppWebhookMessageStatus>()
      .notNull(),
    // Application time when this status webhook event was ingested.
    receivedAt: timestamp('received_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('message_status_events_delivery_uidx').on(
      table.messageId,
      table.status,
      table.providerTimestamp,
    ),
    index('message_status_events_message_occurred_at_idx').on(
      table.messageId,
      table.occurredAt,
    ),
    index('message_status_events_status_occurred_at_idx').on(
      table.status,
      table.occurredAt,
    ),
  ],
)

export const chatEvents = mbaSchema.table(
  'chat_events',
  {
    // Internal immutable chat-event row identifier; this value is not supplied by Meta.
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Eternal application chat resolved from the event's contact, group, call participant, or status recipient.
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => chats.id, { onDelete: 'restrict' }),
    // Normalized application category for a non-message, non-delivery-status event affecting the chat.
    eventType: text('event_type', { enum: chatEventTypes }).notNull(),
    // Webhook subscription field that carried the event; billing windows arrive within the `messages` field.
    source: text('source', { enum: chatEventSources }).notNull(),
    // Meta event, call, request, or billing-conversation ID when the payload provides one.
    providerEventId: text('provider_event_id'),
    // Stable application key derived only from provider identities; makes webhook retries idempotent without a pre-read.
    deduplicationKey: text('deduplication_key').notNull(),
    // Provider action name such as `handover`, `agent_active`, `call_created`, or a group update's `type`.
    providerEventType: text('provider_event_type'),
    // Meta Business Agents conversation correlation value; it is not the application's eternal `chat_id`.
    providerConversationId: text('provider_conversation_id'),
    // Contact that initiated or is affected by the event, when Meta identifies one.
    actorContactId: bigint('actor_contact_id', { mode: 'number' }).references(
      () => contacts.id,
      { onDelete: 'set null' },
    ),
    // Meta Business Agent identifier from `messaging_handovers[].agent.id`, when present.
    agentId: text('agent_id'),
    // Meta Business Agent display name from `messaging_handovers[].agent.name`, when present.
    agentName: text('agent_name'),
    // Provider ownership value before a handover; retained as text because Meta has no stable closed public enum.
    previousOwner: text('previous_owner'),
    // Provider ownership value after a handover; retained as text because Meta has no stable closed public enum.
    newOwner: text('new_owner'),
    // Meta billing-window ID from `statuses[].conversation.id`; never an application chat identifier.
    billingConversationId: text('billing_conversation_id'),
    // Parsed end time from `statuses[].conversation.expiration_timestamp`, when supplied.
    billingConversationExpiresAt: timestamp('billing_conversation_expires_at', {
      withTimezone: true,
    }),
    // Billing-window origin from `statuses[].conversation.origin.type`.
    billingConversationOrigin: text('billing_conversation_origin', {
      enum: whatsappConversationOrigins,
    }),
    // Billing decision from `statuses[].pricing.billable` on the status that announced the window.
    pricingBillable: boolean('pricing_billable'),
    // Meta pricing model from `statuses[].pricing.pricing_model`; values remain provider-defined text.
    pricingModel: text('pricing_model'),
    // Meta pricing category from `statuses[].pricing.category`; values remain provider-defined text.
    pricingCategory: text('pricing_category'),
    // Meta pricing subtype from `statuses[].pricing.type`; values remain provider-defined text.
    pricingType: text('pricing_type'),
    // Original provider timestamp before parsing, preserving either string or numeric webhook representations.
    providerTimestamp: text('provider_timestamp'),
    // Parsed provider event time used for chronological chat timeline queries.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    // Parsed outer `entry[].time`, when Meta supplies it independently from the event timestamp.
    webhookEntryTime: timestamp('webhook_entry_time', { withTimezone: true }),
    // Complete typed webhook event/status object for lossless replay and future provider fields.
    rawEvent: jsonb('raw_event').$type<StoredChatEventPayload>().notNull(),
    // Application time when this event was first persisted.
    receivedAt: timestamp('received_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('chat_events_deduplication_key_uidx').on(
      table.deduplicationKey,
    ),
    index('chat_events_chat_occurred_id_idx').on(
      table.chatId,
      table.occurredAt,
      table.id,
    ),
    index('chat_events_chat_type_occurred_idx').on(
      table.chatId,
      table.eventType,
      table.occurredAt,
    ),
    index('chat_events_provider_event_id_idx').on(table.providerEventId),
    index('chat_events_actor_occurred_idx').on(
      table.actorContactId,
      table.occurredAt,
    ),
    index('chat_events_billing_conversation_id_idx').on(
      table.billingConversationId,
    ),
  ],
)

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type Channel = typeof channels.$inferSelect
export type NewChannel = typeof channels.$inferInsert
export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert
export type Group = typeof groups.$inferSelect
export type NewGroup = typeof groups.$inferInsert
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type MessageStatusEvent = typeof messageStatusEvents.$inferSelect
export type NewMessageStatusEvent = typeof messageStatusEvents.$inferInsert
export type ChatEvent = typeof chatEvents.$inferSelect
export type NewChatEvent = typeof chatEvents.$inferInsert
