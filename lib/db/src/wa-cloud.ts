import type {
  Call,
  CallStatus,
  GroupUpdate,
  HistoryMessage,
  HistoryValue,
  MessageEcho,
  MessagesValue,
  MessagingHandoverEvent,
  MessagingHandoversValue,
  UserPreference,
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhook,
  WhatsAppWebhookEntry,
} from '@mba-demo/schemas/wa-cloud/webhooks'
import { and, eq, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { db, type Database } from './client.js'
import {
  channels,
  chatEvents,
  chats,
  contacts,
  groups,
  messages,
  messageStatusEvents,
  whatsappMessageTypes,
  type ChatEventType,
  type NewChatEvent,
  type StoredWhatsAppContact,
  type WhatsAppGroupWebhookField,
  type WhatsAppInteractiveType,
  type WhatsAppMessageSource,
  type WhatsAppMessageStatus as StoredMessageStatus,
  type WhatsAppMessageType,
} from './schema/mba.js'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type PersistedContact = Pick<
  typeof contacts.$inferSelect,
  'id' | 'waId' | 'userId'
>

type PersistedMessage = Pick<
  typeof messages.$inferSelect,
  'chatId' | 'contactId' | 'id'
>

type IngestibleMessage = HistoryMessage | MessageEcho | WhatsAppMessage

export type WhatsAppChannelConfiguration = Pick<
  typeof channels.$inferSelect,
  | 'id'
  | 'type'
  | 'waAppSecret'
  | 'waWebhookVerifyToken'
  | 'waPhoneNumber'
  | 'waPhoneNumberId'
  | 'waWabaId'
>

export interface WhatsAppWebhookIngestionSummary {
  chatEvents: number
  contacts: number
  groups: number
  messages: number
  statuses: number
}

export class WhatsAppChannelNotFoundError extends Error {
  constructor(channelId: number) {
    super(`WhatsApp channel ${channelId} was not found`)
    this.name = 'WhatsAppChannelNotFoundError'
  }
}

export class WhatsAppWebhookChannelMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhatsAppWebhookChannelMismatchError'
  }
}

export async function findWhatsAppChannelById(
  channelId: number,
  database: Database = db,
): Promise<WhatsAppChannelConfiguration | undefined> {
  const [channel] = await database
    .select({
      id: channels.id,
      type: channels.type,
      waAppSecret: channels.waAppSecret,
      waWebhookVerifyToken: channels.waWebhookVerifyToken,
      waPhoneNumber: channels.waPhoneNumber,
      waPhoneNumberId: channels.waPhoneNumberId,
      waWabaId: channels.waWabaId,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.type, 'whatsapp')))
    .limit(1)

  return channel
}

export function assertWhatsAppWebhookMatchesChannel(
  webhook: WhatsAppWebhook,
  channel: WhatsAppChannelConfiguration,
): void {
  for (const entry of webhook.entry) {
    if (entry.id !== channel.waWabaId) {
      throw new WhatsAppWebhookChannelMismatchError(
        `Webhook WABA ${entry.id} does not belong to channel ${channel.id}`,
      )
    }

    for (const change of entry.changes) {
      const metadata = getWebhookMetadata(change.value)
      if (!metadata) continue

      if (metadata.phone_number_id !== channel.waPhoneNumberId) {
        throw new WhatsAppWebhookChannelMismatchError(
          `Webhook phone number ${metadata.phone_number_id} does not belong to channel ${channel.id}`,
        )
      }

      if (metadata.display_phone_number !== channel.waPhoneNumber) {
        throw new WhatsAppWebhookChannelMismatchError(
          `Webhook display phone number does not belong to channel ${channel.id}`,
        )
      }
    }
  }
}

export async function ingestWhatsAppWebhook(
  channelId: number,
  webhook: WhatsAppWebhook,
  database: Database = db,
): Promise<WhatsAppWebhookIngestionSummary> {
  return database.transaction(async (transaction) => {
    const channel = await findChannel(transaction, channelId)
    if (!channel) throw new WhatsAppChannelNotFoundError(channelId)
    assertWhatsAppWebhookMatchesChannel(webhook, channel)

    const context = new IngestionContext(transaction, channel)

    for (const entry of webhook.entry) {
      await context.ingestEntry(entry)
    }

    return context.summary
  })
}

class IngestionContext {
  readonly summary: WhatsAppWebhookIngestionSummary = {
    chatEvents: 0,
    contacts: 0,
    groups: 0,
    messages: 0,
    statuses: 0,
  }

  private readonly contactsByIdentity = new Map<string, PersistedContact>()
  private readonly groupsByProviderId = new Map<string, number>()
  private readonly directChatsByContactId = new Map<number, number>()
  private readonly groupChatsByGroupId = new Map<number, number>()

  constructor(
    private readonly transaction: DatabaseTransaction,
    private readonly channel: WhatsAppChannelConfiguration,
  ) {}

  async ingestEntry(entry: WhatsAppWebhookEntry): Promise<void> {
    const webhookEntryTime = parseOptionalTimestamp(entry.time)

    for (const change of entry.changes) {
      switch (change.field) {
        case 'messages':
          await this.ingestMessagesChange(change.value, webhookEntryTime)
          break
        case 'history':
          await this.ingestHistoryChange(change.value, webhookEntryTime)
          break
        case 'smb_message_echoes':
          for (const message of change.value.message_echoes) {
            await this.ingestMessage(
              message,
              'message_echo',
              'outbound',
              webhookEntryTime,
              message.to,
            )
          }
          break
        case 'group_lifecycle_update':
        case 'group_participants_update':
        case 'group_settings_update':
        case 'group_status_update':
          for (const update of change.value.groups) {
            await this.upsertGroupEventContacts(update)
            const groupId = await this.upsertGroup(update.group_id, {
              field: change.field,
              update,
            })
            const chatId = await this.upsertGroupChat(groupId)
            const actor = update.initiated_by
              ? await this.upsertContact({ wa_id: update.initiated_by })
              : undefined
            await this.persistChatEvent({
              chatId,
              eventType: groupChatEventType(change.field),
              source: change.field,
              providerEventId: update.request_id,
              deduplicationKey: groupEventDeduplicationKey(
                chatId,
                change.field,
                update,
              ),
              providerEventType: update.type,
              actorContactId: actor?.id,
              providerTimestamp: String(update.timestamp),
              occurredAt: parseRequiredTimestamp(update.timestamp),
              webhookEntryTime,
              rawEvent: update,
            })
          }
          break
        case 'messaging_handovers':
          await this.ingestMessagingHandovers(change.value, webhookEntryTime)
          break
        case 'calls':
          await this.ingestCallsChange(change.value, webhookEntryTime)
          break
        case 'user_preferences':
          await this.ingestUserPreferencesChange(
            change.value.contacts ?? [],
            change.value.user_preferences,
            webhookEntryTime,
          )
          break
        case 'smb_app_state_sync':
          for (const state of change.value.state_sync) {
            const name = state.contact.full_name ?? state.contact.first_name
            await this.upsertContact({
              wa_id: state.contact.phone_number,
              profile: name ? { name } : undefined,
            })
          }
          break
        default:
          break
      }
    }
  }

  private async ingestMessagesChange(
    value: MessagesValue,
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const contactMap = await this.upsertContacts(value.contacts ?? [])

    if ('messages' in value && value.messages) {
      for (const message of value.messages) {
        await this.ingestInboundMessage(
          message,
          'messages',
          webhookEntryTime,
          contactMap,
        )
      }
    }

    if ('standby' in value && value.standby) {
      for (const message of value.standby) {
        await this.ingestInboundMessage(
          message,
          'standby',
          webhookEntryTime,
          contactMap,
        )
      }
    }

    if ('statuses' in value && value.statuses) {
      for (const status of value.statuses) {
        if (status.type === 'payment') continue
        await this.ingestStatus(status, contactMap, webhookEntryTime)
      }
    }
  }

  private async ingestMessagingHandovers(
    value: MessagingHandoversValue,
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const knownContacts = await this.upsertContacts(value.contacts ?? [])

    for (const event of value.messaging_handovers) {
      const contact = await this.resolveDirectEventContact(
        event.user_id,
        knownContacts,
      )
      if (!contact) {
        throw new Error(
          `Cannot resolve contact for messaging handover ${event.id}`,
        )
      }

      const chatId = await this.upsertDirectChat(contact.id)
      await this.persistChatEvent({
        chatId,
        eventType: normalizeHandoverEventType(event),
        source: 'messaging_handovers',
        providerEventId: event.id,
        deduplicationKey: `${chatId}:messaging_handovers:${event.id}`,
        providerEventType: event.event_type ?? event.event,
        providerConversationId: event.conversation_id,
        actorContactId: contact.id,
        agentId: event.agent?.id,
        agentName: event.agent?.name,
        previousOwner: event.previous_owner,
        newOwner: event.new_owner,
        providerTimestamp: String(event.timestamp),
        occurredAt: parseRequiredTimestamp(event.timestamp),
        webhookEntryTime,
        rawEvent: event,
      })
    }
  }

  private async ingestCallsChange(
    value: {
      calls?: readonly Call[]
      contacts?: readonly WhatsAppContact[]
      statuses?: readonly CallStatus[]
    },
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const knownContacts = await this.upsertContacts(value.contacts ?? [])

    for (const call of value.calls ?? []) {
      const identity =
        call.direction === 'BUSINESS_INITIATED'
          ? (call.to_user_id ?? call.to_parent_user_id ?? call.to)
          : (call.from_user_id ?? call.from_parent_user_id ?? call.from)
      const contact = await this.resolveDirectEventContact(
        identity,
        knownContacts,
      )
      if (!contact)
        throw new Error(`Cannot resolve contact for call ${call.id}`)
      const chatId = await this.upsertDirectChat(contact.id)
      await this.persistChatEvent({
        chatId,
        eventType: 'call',
        source: 'calls',
        providerEventId: call.id,
        deduplicationKey: `${chatId}:call:${call.id}:${call.event}:${String(call.timestamp)}`,
        providerEventType: call.event,
        actorContactId: contact.id,
        providerTimestamp: String(call.timestamp),
        occurredAt: parseRequiredTimestamp(call.timestamp),
        webhookEntryTime,
        rawEvent: call,
      })
    }

    for (const status of value.statuses ?? []) {
      const contact = await this.resolveDirectEventContact(
        status.recipient_user_id ??
          status.recipient_parent_user_id ??
          status.recipient_id,
        knownContacts,
      )
      if (!contact) {
        throw new Error(`Cannot resolve contact for call status ${status.id}`)
      }
      const chatId = await this.upsertDirectChat(contact.id)
      await this.persistChatEvent({
        chatId,
        eventType: 'call_status',
        source: 'calls',
        providerEventId: status.id,
        deduplicationKey: `${chatId}:call_status:${status.id}:${status.status}:${status.timestamp}`,
        providerEventType: status.status,
        actorContactId: contact.id,
        providerTimestamp: status.timestamp,
        occurredAt: parseRequiredTimestamp(status.timestamp),
        webhookEntryTime,
        rawEvent: status,
      })
    }
  }

  private async ingestUserPreferencesChange(
    rawContacts: readonly WhatsAppContact[],
    preferences: readonly UserPreference[],
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const knownContacts = await this.upsertContacts(rawContacts)

    for (const preference of preferences) {
      const contact = await this.resolveDirectEventContact(
        preference.wa_id,
        knownContacts,
      )
      if (!contact) {
        throw new Error(
          `Cannot resolve contact for user preference ${preference.wa_id}`,
        )
      }
      const chatId = await this.upsertDirectChat(contact.id)
      await this.persistChatEvent({
        chatId,
        eventType: 'user_preference',
        source: 'user_preferences',
        deduplicationKey: `${chatId}:user_preference:${preference.category}:${String(preference.timestamp)}:${preference.value}`,
        providerEventType: preference.detail,
        actorContactId: contact.id,
        providerTimestamp: String(preference.timestamp),
        occurredAt: parseRequiredTimestamp(preference.timestamp),
        webhookEntryTime,
        rawEvent: preference,
      })
    }
  }

  private async ingestHistoryChange(
    value: HistoryValue,
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    if ('messages' in value && value.messages) {
      for (const message of value.messages as WhatsAppMessage[]) {
        await this.ingestInboundMessage(
          message,
          'history',
          webhookEntryTime,
          new Map(),
        )
      }
      return
    }

    if (!('history' in value) || !value.history) return

    for (const chunk of value.history) {
      for (const thread of chunk.threads ?? []) {
        for (const message of thread.messages) {
          const isOutbound = this.isBusinessIdentity(message.from)
          const remoteIdentity = isOutbound
            ? (message.to ?? thread.id)
            : message.from

          await this.ingestMessage(
            message,
            'history',
            isOutbound ? 'outbound' : 'inbound',
            webhookEntryTime,
            remoteIdentity,
          )
        }
      }
    }
  }

  private async ingestInboundMessage(
    message: WhatsAppMessage,
    source: 'history' | 'messages' | 'standby',
    webhookEntryTime: Date | undefined,
    knownContacts: ReadonlyMap<string, PersistedContact>,
  ): Promise<void> {
    const senderIdentity = message.from_user_id ?? message.from
    const knownContact = senderIdentity
      ? knownContacts.get(senderIdentity)
      : undefined
    const contactId =
      knownContact?.id ??
      (senderIdentity
        ? (
            await this.upsertContact({
              wa_id: message.from,
              user_id: message.from_user_id,
              parent_user_id: message.from_parent_user_id,
            })
          )?.id
        : undefined)

    if (!message.group_id && !contactId) {
      throw new Error(`Cannot resolve direct chat for message ${message.id}`)
    }

    await this.ingestMessage(
      message,
      source,
      'inbound',
      webhookEntryTime,
      message.group_id ?? this.channel.waPhoneNumber,
      contactId,
      message.group_id,
    )
  }

  private async ingestMessage(
    message: IngestibleMessage,
    source: WhatsAppMessageSource,
    direction: 'inbound' | 'outbound',
    webhookEntryTime: Date | undefined,
    remoteIdentity: string,
    knownContactId?: number,
    providerGroupId?: string,
  ): Promise<PersistedMessage> {
    const record = asRecord(message)
    const senderPhone = getString(record, 'from')
    const senderUserId = getString(record, 'from_user_id')
    const senderParentUserId = getString(record, 'from_parent_user_id')
    const contactId =
      knownContactId ??
      (providerGroupId
        ? undefined
        : (await this.upsertContact({ wa_id: remoteIdentity }))?.id)

    let chatId: number
    if (providerGroupId) {
      const groupId = await this.upsertGroup(providerGroupId)
      chatId = await this.upsertGroupChat(groupId)
    } else {
      if (!contactId) {
        throw new Error(`Cannot resolve direct chat for message ${message.id}`)
      }
      chatId = await this.upsertDirectChat(contactId)
    }

    const messageType = normalizeMessageType(message.type)
    const occurredAt = parseOptionalTimestamp(message.timestamp)
    const recipientId =
      direction === 'outbound'
        ? (getString(record, 'to') ?? remoteIdentity)
        : (providerGroupId ?? this.channel.waPhoneNumber)
    const now = new Date()
    const values = {
      chatId,
      contactId,
      providerMessageId: message.id,
      source,
      direction,
      messageType,
      interactiveType: getInteractiveType(record),
      dispatchStatus:
        source === 'message_echo' ? ('accepted' as const) : undefined,
      senderPhone,
      senderUserId,
      senderParentUserId,
      recipientId,
      recipientType: providerGroupId
        ? ('group' as const)
        : ('individual' as const),
      providerTimestamp: message.timestamp,
      occurredAt,
      webhookEntryTime,
      contextMessageId: getContextMessageId(record),
      targetMessageId: getTargetMessageId(record),
      rawMessage: message,
      updatedAt: now,
    }

    const [storedMessage] = await this.transaction
      .insert(messages)
      .values(values)
      .onConflictDoUpdate({
        target: messages.providerMessageId,
        set: values,
      })
      .returning({
        id: messages.id,
        chatId: messages.chatId,
        contactId: messages.contactId,
      })

    if (!storedMessage)
      throw new Error(`Failed to persist message ${message.id}`)

    await this.advanceLatestMessage(storedMessage.chatId, storedMessage.id)
    this.summary.messages += 1
    return storedMessage
  }

  private async ingestStatus(
    status: WhatsAppMessageStatus,
    knownContacts: ReadonlyMap<string, PersistedContact>,
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const occurredAt = parseRequiredTimestamp(status.timestamp)
    let [storedMessage] = await this.transaction
      .select({
        id: messages.id,
        chatId: messages.chatId,
        contactId: messages.contactId,
      })
      .from(messages)
      .where(eq(messages.providerMessageId, status.id))
      .limit(1)

    if (!storedMessage) {
      const resolved = await this.resolveStatusChat(status, knownContacts)
      ;[storedMessage] = await this.transaction
        .insert(messages)
        .values({
          chatId: resolved.chatId,
          contactId: resolved.contactId,
          providerMessageId: status.id,
          source: 'status',
          direction: 'outbound',
        })
        .onConflictDoNothing({ target: messages.providerMessageId })
        .returning({
          id: messages.id,
          chatId: messages.chatId,
          contactId: messages.contactId,
        })

      storedMessage ??= await this.findMessageByProviderId(status.id)
      if (!storedMessage) {
        throw new Error(`Failed to persist status-first message ${status.id}`)
      }

      await this.advanceLatestMessage(storedMessage.chatId, storedMessage.id)
    }

    const recipientType = status.recipient_type ?? 'individual'
    const billingConversationExpiresAt = parseOptionalTimestamp(
      status.conversation?.expiration_timestamp,
    )

    await this.transaction
      .insert(messageStatusEvents)
      .values({
        messageId: storedMessage.id,
        status: status.status,
        providerTimestamp: status.timestamp,
        occurredAt,
        recipientId: status.recipient_id,
        recipientUserId: status.recipient_user_id,
        recipientParentUserId: status.recipient_parent_user_id,
        recipientType,
        recipientParticipantId: status.recipient_participant_id,
        recipientIdentityKeyHash: status.recipient_identity_key_hash,
        bizOpaqueCallbackData: status.biz_opaque_callback_data,
        billingConversationId: status.conversation?.id,
        billingConversationExpiresAt,
        billingConversationOrigin: status.conversation?.origin.type,
        pricingBillable: status.pricing?.billable,
        pricingModel: status.pricing?.pricing_model,
        pricingCategory: status.pricing?.category,
        pricingType: status.pricing?.type,
        errors: status.errors,
        rawStatus: status,
      })
      .onConflictDoNothing({
        target: [
          messageStatusEvents.messageId,
          messageStatusEvents.status,
          messageStatusEvents.providerTimestamp,
        ],
      })

    if (status.conversation) {
      await this.persistChatEvent({
        chatId: storedMessage.chatId,
        eventType: 'billing_window_opened',
        source: 'messages',
        providerEventId: status.conversation.id,
        deduplicationKey: `${storedMessage.chatId}:billing_window:${status.conversation.id}`,
        providerEventType: status.conversation.origin.type,
        providerConversationId: status.conversation.id,
        actorContactId: storedMessage.contactId,
        billingConversationId: status.conversation.id,
        billingConversationExpiresAt,
        billingConversationOrigin: status.conversation.origin.type,
        pricingBillable: status.pricing?.billable,
        pricingModel: status.pricing?.pricing_model,
        pricingCategory: status.pricing?.category,
        pricingType: status.pricing?.type,
        providerTimestamp: status.timestamp,
        occurredAt,
        webhookEntryTime,
        rawEvent: status,
      })
    }

    const incomingRank = statusRank[status.status]
    await this.transaction
      .update(messages)
      .set({
        status: status.status,
        statusProviderTimestamp: status.timestamp,
        statusOccurredAt: occurredAt,
        statusUpdatedAt: new Date(),
        recipientId: status.recipient_id,
        recipientUserId: status.recipient_user_id,
        recipientParentUserId: status.recipient_parent_user_id,
        recipientType,
        recipientParticipantId: status.recipient_participant_id,
        recipientIdentityKeyHash: status.recipient_identity_key_hash,
        bizOpaqueCallbackData: status.biz_opaque_callback_data,
        billingConversationId: status.conversation?.id,
        billingConversationExpiresAt,
        billingConversationOrigin: status.conversation?.origin.type,
        pricingBillable: status.pricing?.billable,
        pricingModel: status.pricing?.pricing_model,
        pricingCategory: status.pricing?.category,
        pricingType: status.pricing?.type,
        statusErrors: status.errors,
        rawStatus: status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messages.id, storedMessage.id),
          or(
            isNull(messages.statusOccurredAt),
            lt(messages.statusOccurredAt, occurredAt),
            and(
              eq(messages.statusOccurredAt, occurredAt),
              sql`${incomingRank} > case ${messages.status}
                when 'sent' then 0
                when 'delivered' then 1
                when 'read' then 2
                when 'played' then 3
                else 4
              end`,
            ),
          ),
        ),
      )

    this.summary.statuses += 1
  }

  private async resolveStatusChat(
    status: WhatsAppMessageStatus,
    knownContacts: ReadonlyMap<string, PersistedContact>,
  ): Promise<{ chatId: number; contactId?: number }> {
    if (status.recipient_type === 'group') {
      if (!status.recipient_id) {
        throw new Error(`Group status ${status.id} has no recipient_id`)
      }

      const groupId = await this.upsertGroup(status.recipient_id)
      const contactId = status.recipient_participant_id
        ? (
            await this.upsertContact({
              wa_id: status.recipient_participant_id,
              identity_key_hash: status.recipient_identity_key_hash,
            })
          )?.id
        : undefined

      return {
        chatId: await this.upsertGroupChat(groupId),
        contactId,
      }
    }

    const identity =
      status.recipient_user_id ??
      status.recipient_id ??
      status.recipient_parent_user_id
    if (!identity) {
      throw new Error(`Direct status ${status.id} has no recipient identity`)
    }

    const contact =
      knownContacts.get(identity) ??
      (await this.upsertContact({
        wa_id: status.recipient_id,
        user_id: status.recipient_user_id,
        parent_user_id: status.recipient_parent_user_id,
        identity_key_hash: status.recipient_identity_key_hash,
      }))

    if (!contact)
      throw new Error(`Cannot resolve contact for status ${status.id}`)
    return {
      chatId: await this.upsertDirectChat(contact.id),
      contactId: contact.id,
    }
  }

  private async resolveDirectEventContact(
    identity: string | undefined,
    knownContacts: ReadonlyMap<string, PersistedContact>,
  ): Promise<PersistedContact | undefined> {
    if (identity) {
      const known = knownContacts.get(identity)
      if (known) return known
      return this.upsertContact({ wa_id: identity })
    }

    const firstKnown = knownContacts.values().next()
    return firstKnown.done ? undefined : firstKnown.value
  }

  private async persistChatEvent(
    event: Omit<NewChatEvent, 'id' | 'receivedAt'>,
  ): Promise<void> {
    await this.transaction
      .insert(chatEvents)
      .values(event)
      .onConflictDoUpdate({
        target: chatEvents.deduplicationKey,
        set: {
          ...event,
          // A logical event can be observed again in a later status webhook.
          // Keep its first provider occurrence while allowing promoted metadata
          // (for example pricing details) to become more complete.
          providerTimestamp: sql`case
          when excluded.occurred_at < ${chatEvents.occurredAt}
            then excluded.provider_timestamp
          else ${chatEvents.providerTimestamp}
        end`,
          occurredAt: sql`least(${chatEvents.occurredAt}, excluded.occurred_at)`,
          rawEvent: sql`case
          when excluded.occurred_at < ${chatEvents.occurredAt}
            then excluded.raw_event
          else ${chatEvents.rawEvent}
        end`,
        },
      })
    this.summary.chatEvents += 1
  }

  private async upsertContacts(
    rawContacts: readonly WhatsAppContact[],
  ): Promise<Map<string, PersistedContact>> {
    const resolved = new Map<string, PersistedContact>()

    for (const rawContact of rawContacts) {
      const contact = await this.upsertContact(rawContact)
      if (!contact) continue
      for (const identity of [contact.waId, contact.userId]) {
        if (identity) resolved.set(identity, contact)
      }
    }

    return resolved
  }

  private async upsertGroupEventContacts(update: GroupUpdate): Promise<void> {
    const identities = new Map<string, string | undefined>()

    for (const participant of [
      ...(update.added_participants ?? []),
      ...(update.removed_participants ?? []),
      ...(update.failed_participants ?? []),
    ]) {
      if (participant.wa_id) {
        identities.set(participant.wa_id, participant.input)
      }
    }

    for (const identity of [update.wa_id, update.initiated_by]) {
      if (identity && !identities.has(identity))
        identities.set(identity, undefined)
    }

    for (const [waId, input] of identities) {
      await this.upsertContact({ wa_id: waId, ...(input ? { input } : {}) })
    }
  }

  private async upsertContact(
    rawContact: StoredWhatsAppContact,
  ): Promise<PersistedContact | undefined> {
    const record = asRecord(rawContact)
    const waId = getString(record, 'wa_id')
    const userId = getString(record, 'user_id')
    if (!waId && !userId) return undefined

    const cacheKey = waId ? `wa:${waId}` : `user:${userId}`
    const cached = this.contactsByIdentity.get(cacheKey)
    const carriesProfileOrIdentityData = [
      record.profile,
      record.user_id,
      record.parent_user_id,
      record.identity_key_hash,
      record.input,
    ].some((value) => value !== undefined)
    if (cached && !carriesProfileOrIdentityData) return cached

    const profile = getRecord(record, 'profile')
    const identityConditions = [
      waId ? eq(contacts.waId, waId) : undefined,
      userId ? eq(contacts.userId, userId) : undefined,
    ].filter((condition) => condition !== undefined)
    const [existing] = cached
      ? [cached]
      : await this.transaction
          .select({
            id: contacts.id,
            waId: contacts.waId,
            userId: contacts.userId,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.channelId, this.channel.id),
              or(...identityConditions),
            ),
          )
          .limit(1)
    const values = {
      channelId: this.channel.id,
      waId,
      userId,
      parentUserId: getString(record, 'parent_user_id'),
      identityKeyHash: getString(record, 'identity_key_hash'),
      input: getString(record, 'input'),
      profileName: profile ? getString(profile, 'name') : undefined,
      profileUsername: profile ? getString(profile, 'username') : undefined,
      rawContact,
      lastSeenAt: new Date(),
    }

    let contact: PersistedContact | undefined
    if (existing) {
      ;[contact] = await this.transaction
        .update(contacts)
        .set(values)
        .where(eq(contacts.id, existing.id))
        .returning({
          id: contacts.id,
          waId: contacts.waId,
          userId: contacts.userId,
        })
    } else {
      ;[contact] = await this.transaction
        .insert(contacts)
        .values(values)
        .onConflictDoNothing()
        .returning({
          id: contacts.id,
          waId: contacts.waId,
          userId: contacts.userId,
        })

      if (!contact) {
        ;[contact] = await this.transaction
          .select({
            id: contacts.id,
            waId: contacts.waId,
            userId: contacts.userId,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.channelId, this.channel.id),
              or(...identityConditions),
            ),
          )
          .limit(1)
      }
    }

    if (!contact) throw new Error('Failed to persist WhatsApp contact')
    if (contact.waId) this.contactsByIdentity.set(`wa:${contact.waId}`, contact)
    if (contact.userId) {
      this.contactsByIdentity.set(`user:${contact.userId}`, contact)
    }
    this.summary.contacts += 1
    return contact
  }

  private async upsertGroup(
    providerGroupId: string,
    event?: { field: WhatsAppGroupWebhookField; update: GroupUpdate },
  ): Promise<number> {
    const cached = this.groupsByProviderId.get(providerGroupId)
    if (cached && !event) return cached

    const now = new Date()
    const eventAt = event
      ? parseRequiredTimestamp(event.update.timestamp)
      : undefined
    const [inserted] = await this.transaction
      .insert(groups)
      .values({
        channelId: this.channel.id,
        providerGroupId,
        subject: event?.update.subject,
        description: event?.update.description,
        inviteLink: event?.update.invite_link,
        joinApprovalMode: event?.update.join_approval_mode,
        lastWebhookField: event?.field,
        lastEventType: event?.update.type,
        lastEventAt: eventAt,
        rawGroup: event?.update,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [groups.channelId, groups.providerGroupId],
      })
      .returning({ id: groups.id })

    let groupId = inserted?.id
    if (!groupId) {
      const [existing] = await this.transaction
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(
            eq(groups.channelId, this.channel.id),
            eq(groups.providerGroupId, providerGroupId),
          ),
        )
        .limit(1)
      groupId = existing?.id

      if (groupId && event && eventAt) {
        await this.transaction
          .update(groups)
          .set({
            ...(event.update.subject === undefined
              ? {}
              : { subject: event.update.subject }),
            ...(event.update.description === undefined
              ? {}
              : { description: event.update.description }),
            ...(event.update.invite_link === undefined
              ? {}
              : { inviteLink: event.update.invite_link }),
            ...(event.update.join_approval_mode === undefined
              ? {}
              : { joinApprovalMode: event.update.join_approval_mode }),
            lastWebhookField: event.field,
            lastEventType: event.update.type,
            lastEventAt: eventAt,
            rawGroup: event.update,
            updatedAt: now,
          })
          .where(
            and(
              eq(groups.id, groupId),
              or(isNull(groups.lastEventAt), lte(groups.lastEventAt, eventAt)),
            ),
          )
      }
    }

    if (!groupId) throw new Error(`Failed to persist group ${providerGroupId}`)
    this.groupsByProviderId.set(providerGroupId, groupId)
    this.summary.groups += 1
    return groupId
  }

  private async upsertDirectChat(contactId: number): Promise<number> {
    const cached = this.directChatsByContactId.get(contactId)
    if (cached) return cached

    const [chat] = await this.transaction
      .insert(chats)
      .values({ kind: 'direct', contactId })
      .onConflictDoUpdate({
        target: chats.contactId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: chats.id })

    if (!chat) throw new Error(`Failed to persist direct chat ${contactId}`)
    this.directChatsByContactId.set(contactId, chat.id)
    return chat.id
  }

  private async upsertGroupChat(groupId: number): Promise<number> {
    const cached = this.groupChatsByGroupId.get(groupId)
    if (cached) return cached

    const [chat] = await this.transaction
      .insert(chats)
      .values({ kind: 'group', groupId })
      .onConflictDoUpdate({
        target: chats.groupId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: chats.id })

    if (!chat) throw new Error(`Failed to persist group chat ${groupId}`)
    this.groupChatsByGroupId.set(groupId, chat.id)
    return chat.id
  }

  private async findMessageByProviderId(
    providerMessageId: string,
  ): Promise<PersistedMessage | undefined> {
    const [message] = await this.transaction
      .select({
        id: messages.id,
        chatId: messages.chatId,
        contactId: messages.contactId,
      })
      .from(messages)
      .where(eq(messages.providerMessageId, providerMessageId))
      .limit(1)
    return message
  }

  private async advanceLatestMessage(
    chatId: number,
    messageId: number,
  ): Promise<void> {
    await this.transaction
      .update(chats)
      .set({ latestMessageId: messageId, updatedAt: new Date() })
      .where(
        and(
          eq(chats.id, chatId),
          or(
            isNull(chats.latestMessageId),
            lt(chats.latestMessageId, messageId),
          ),
        ),
      )
  }

  private isBusinessIdentity(value: string): boolean {
    return (
      value === this.channel.waPhoneNumber ||
      value === this.channel.waPhoneNumberId
    )
  }
}

async function findChannel(
  transaction: DatabaseTransaction,
  channelId: number,
): Promise<WhatsAppChannelConfiguration | undefined> {
  const [channel] = await transaction
    .select({
      id: channels.id,
      type: channels.type,
      waAppSecret: channels.waAppSecret,
      waWebhookVerifyToken: channels.waWebhookVerifyToken,
      waPhoneNumber: channels.waPhoneNumber,
      waPhoneNumberId: channels.waPhoneNumberId,
      waWabaId: channels.waWabaId,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.type, 'whatsapp')))
    .limit(1)
  return channel
}

const messageTypeSet = new Set<string>(whatsappMessageTypes)

function normalizeHandoverEventType(
  event: MessagingHandoverEvent,
): ChatEventType {
  if (event.event === 'handover') return 'handover'
  if (event.event === 'agent_event' || event.event_type) return 'agent_event'
  return 'other'
}

function groupChatEventType(field: WhatsAppGroupWebhookField): ChatEventType {
  switch (field) {
    case 'group_lifecycle_update':
      return 'group_lifecycle'
    case 'group_participants_update':
      return 'group_participants'
    case 'group_settings_update':
      return 'group_settings'
    case 'group_status_update':
      return 'group_status'
  }
}

function groupEventDeduplicationKey(
  chatId: number,
  field: WhatsAppGroupWebhookField,
  update: GroupUpdate,
): string {
  const providerIdentity = update.request_id
    ? `${update.request_id}:${update.type}`
    : `${update.type}:${String(update.timestamp)}`
  return `${chatId}:${field}:${providerIdentity}`
}

function normalizeMessageType(type: string): WhatsAppMessageType {
  return messageTypeSet.has(type) ? (type as WhatsAppMessageType) : 'unknown'
}

function getInteractiveType(
  message: Record<string, unknown>,
): WhatsAppInteractiveType | undefined {
  const interactive = getRecord(message, 'interactive')
  const type = interactive ? getString(interactive, 'type') : undefined
  const supported = [
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
  return supported.find((value) => value === type)
}

function getContextMessageId(
  message: Record<string, unknown>,
): string | undefined {
  const context = getRecord(message, 'context')
  return context
    ? (getString(context, 'id') ?? getString(context, 'message_id'))
    : undefined
}

function getTargetMessageId(
  message: Record<string, unknown>,
): string | undefined {
  const reaction = getRecord(message, 'reaction')
  if (reaction) {
    return (
      getString(reaction, 'message_id') ?? getString(reaction, 'messsage_id')
    )
  }

  const edit = getRecord(message, 'edit')
  if (edit) return getString(edit, 'original_message_id')
  const revoke = getRecord(message, 'revoke')
  return revoke ? getString(revoke, 'original_message_id') : undefined
}

function getWebhookMetadata(
  value: unknown,
): { display_phone_number: string; phone_number_id: string } | undefined {
  const record = asRecord(value)
  const metadata = getRecord(record, 'metadata')
  const displayPhoneNumber = metadata
    ? getString(metadata, 'display_phone_number')
    : undefined
  const phoneNumberId = metadata
    ? getString(metadata, 'phone_number_id')
    : undefined

  return displayPhoneNumber && phoneNumberId
    ? {
        display_phone_number: displayPhoneNumber,
        phone_number_id: phoneNumberId,
      }
    : undefined
}

function parseRequiredTimestamp(value: string | number): Date {
  const parsed = parseOptionalTimestamp(value)
  if (!parsed) throw new Error(`Invalid WhatsApp timestamp: ${String(value)}`)
  return parsed
}

function parseOptionalTimestamp(
  value: string | number | undefined,
): Date | undefined {
  if (value === undefined) return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return undefined
  const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
  const result = new Date(milliseconds)
  return Number.isNaN(result.getTime()) ? undefined : result
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function getRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function getString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const statusRank: Record<StoredMessageStatus, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
  played: 3,
  failed: -1,
  deleted: -1,
}
