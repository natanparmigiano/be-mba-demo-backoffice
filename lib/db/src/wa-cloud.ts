import type {
  WhatsAppOutboundMessage,
  WhatsAppSendMessageResponse,
} from '@mba-demo/wa-messaging'
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
  StandbyMessageEcho,
  StandbyValue,
  UserPreference,
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhook,
  WhatsAppWebhookEntry,
} from '@mba-demo/wa-webhooks'
import { and, eq, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'
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
  type ChatHandler,
  type ChatEventType,
  type NewChatEvent,
  type StoredWhatsAppMessagePayload,
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

export type IngestibleMessage = HistoryMessage | MessageEcho | WhatsAppMessage
export type ProjectableWhatsAppMessage =
  IngestibleMessage | WhatsAppOutboundMessage

export type WhatsAppMessageContentProjection = Pick<
  typeof messages.$inferSelect,
  | 'textContent'
  | 'mediaId'
  | 'mediaUrl'
  | 'mediaMimeType'
  | 'mediaSha256'
  | 'mediaFileName'
  | 'mediaCaption'
  | 'mediaVoice'
  | 'mediaAnimated'
  | 'interactiveData'
  | 'contactData'
  | 'locationData'
  | 'buttonData'
  | 'orderData'
  | 'reactionData'
  | 'templateData'
  | 'systemData'
  | 'editData'
  | 'revokeData'
  | 'contextData'
  | 'referralData'
  | 'identityData'
  | 'errorsData'
  | 'forwarded'
  | 'frequentlyForwarded'
>

export type WhatsAppChannelConfiguration = Pick<
  typeof channels.$inferSelect,
  | 'id'
  | 'organizationId'
  | 'type'
  | 'waAppSecret'
  | 'waWebhookVerifyToken'
  | 'webhookForwardUrls'
  | 'waPhoneNumber'
  | 'waPhoneNumberId'
  | 'waSystemUserAccessToken'
  | 'waWabaId'
>

export interface WhatsAppWebhookIngestionOptions {
  mediaFilePaths?: ReadonlyMap<string, string>
}

export interface WhatsAppWebhookIngestionSummary {
  organizationId: string
  chatEvents: number
  contacts: number
  groups: number
  messages: number
  statuses: number
  updates: WhatsAppChatUpdate[]
}

export interface PersistWhatsAppOutboundMessageInput {
  chatId: number
  clientMessageId: string
  contactId?: number
  mediaFilePath?: string
  mediaMimeType?: string
  templatePreview?: string
  message: WhatsAppOutboundMessage
  recipientType?: 'group' | 'individual'
  response: WhatsAppSendMessageResponse
}

export interface PersistedWhatsAppOutboundMessage {
  chatId: number
  id: number
  providerMessageId: string
}

export type WhatsAppChatUpdateType =
  'conversation.updated' | 'message.created' | 'message.status.updated'

export interface WhatsAppChatUpdate {
  chatId: number
  type: WhatsAppChatUpdateType
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
      organizationId: channels.organizationId,
      type: channels.type,
      waAppSecret: channels.waAppSecret,
      waWebhookVerifyToken: channels.waWebhookVerifyToken,
      webhookForwardUrls: channels.webhookForwardUrls,
      waPhoneNumber: channels.waPhoneNumber,
      waPhoneNumberId: channels.waPhoneNumberId,
      waSystemUserAccessToken: channels.waSystemUserAccessToken,
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

      const webhookPhoneNumber = normalizePhoneNumber(
        metadata.display_phone_number,
      )
      const channelPhoneNumber = normalizePhoneNumber(channel.waPhoneNumber)
      if (
        !webhookPhoneNumber ||
        !channelPhoneNumber ||
        webhookPhoneNumber !== channelPhoneNumber
      ) {
        throw new WhatsAppWebhookChannelMismatchError(
          `Webhook display phone number does not belong to channel ${channel.id}`,
        )
      }
    }
  }
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, '')
}

export async function ingestWhatsAppWebhook(
  channelId: number,
  webhook: WhatsAppWebhook,
  database: Database = db,
  options: WhatsAppWebhookIngestionOptions = {},
): Promise<WhatsAppWebhookIngestionSummary> {
  return database.transaction(async (transaction) => {
    const channel = await findChannel(transaction, channelId)
    if (!channel) throw new WhatsAppChannelNotFoundError(channelId)
    assertWhatsAppWebhookMatchesChannel(webhook, channel)

    const context = new IngestionContext(
      transaction,
      channel,
      options.mediaFilePaths,
    )

    for (const entry of webhook.entry) {
      await context.ingestEntry(entry)
    }

    return context.summary
  })
}

export async function persistWhatsAppOutboundMessage(
  input: PersistWhatsAppOutboundMessageInput,
  database: Database = db,
): Promise<PersistedWhatsAppOutboundMessage> {
  const providerMessageId = input.response.messages[0]?.id
  if (!providerMessageId) {
    throw new Error('WhatsApp send response did not include a message ID')
  }

  return database.transaction(async (transaction) => {
    const now = new Date()
    const record = asRecord(input.message)
    const projection = projectWhatsAppMessageContent(input.message)
    const values = {
      chatId: input.chatId,
      contactId: input.contactId,
      clientMessageId: input.clientMessageId,
      providerMessageId,
      source: 'outbound_api' as const,
      direction: 'outbound' as const,
      messageType: input.message.type,
      interactiveType: getInteractiveType(record),
      ...projection,
      ...(input.templatePreview ? { textContent: input.templatePreview } : {}),
      ...(input.mediaFilePath ? { mediaFilePath: input.mediaFilePath } : {}),
      ...(input.mediaMimeType ? { mediaMimeType: input.mediaMimeType } : {}),
      dispatchStatus: 'accepted' as const,
      recipientId: input.message.to,
      recipientType: input.recipientType ?? 'individual',
      occurredAt: now,
      contextMessageId: getContextMessageId(record),
      targetMessageId: getTargetMessageId(record),
      rawMessage: input.message,
      sendResponse: input.response,
      updatedAt: now,
    }

    let [stored] = await transaction
      .insert(messages)
      .values(values)
      .onConflictDoNothing()
      .returning({
        chatId: messages.chatId,
        id: messages.id,
        providerMessageId: messages.providerMessageId,
      })

    if (!stored) {
      ;[stored] = await transaction
        .select({
          chatId: messages.chatId,
          id: messages.id,
          providerMessageId: messages.providerMessageId,
        })
        .from(messages)
        .where(
          or(
            eq(messages.providerMessageId, providerMessageId),
            and(
              eq(messages.chatId, input.chatId),
              eq(messages.clientMessageId, input.clientMessageId),
            ),
          ),
        )
        .limit(1)
    }

    if (!stored?.providerMessageId) {
      throw new Error(`Failed to persist outbound message ${providerMessageId}`)
    }

    await transaction
      .update(chats)
      .set({
        latestMessageId: sql`case
          when ${chats.latestMessageId} is null or ${chats.latestMessageId} < ${stored.id}
            then ${stored.id}
          else ${chats.latestMessageId}
        end`,
        updatedAt: now,
      })
      .where(eq(chats.id, input.chatId))

    return {
      chatId: stored.chatId,
      id: stored.id,
      providerMessageId: stored.providerMessageId,
    }
  })
}

class IngestionContext {
  readonly summary: WhatsAppWebhookIngestionSummary

  private readonly contactsByIdentity = new Map<string, PersistedContact>()
  private readonly groupsByProviderId = new Map<string, number>()
  private readonly directChatsByContactId = new Map<number, number>()
  private readonly groupChatsByGroupId = new Map<number, number>()
  private readonly updateKeys = new Set<string>()

  constructor(
    private readonly transaction: DatabaseTransaction,
    private readonly channel: WhatsAppChannelConfiguration,
    private readonly mediaFilePaths: ReadonlyMap<string, string> = new Map(),
  ) {
    this.summary = {
      organizationId: channel.organizationId,
      chatEvents: 0,
      contacts: 0,
      groups: 0,
      messages: 0,
      statuses: 0,
      updates: [],
    }
  }

  async ingestEntry(entry: WhatsAppWebhookEntry): Promise<void> {
    const webhookEntryTime = parseOptionalTimestamp(entry.time)

    for (const change of entry.changes) {
      switch (change.field) {
        case 'messages':
          await this.ingestMessagesChange(change.value, webhookEntryTime)
          break
        case 'standby':
          await this.ingestStandbyChange(change.value, webhookEntryTime)
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

    if ('statuses' in value && value.statuses) {
      for (const status of value.statuses) {
        if (status.type === 'payment') continue
        await this.ingestStatus(status, contactMap, webhookEntryTime)
      }
    }
  }

  private async ingestStandbyChange(
    value: StandbyValue,
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const payload = value.standby
    const contactMap = await this.upsertContacts(payload.contacts ?? [])

    for (const message of payload.messages ?? []) {
      await this.ingestInboundMessage(
        message,
        'standby',
        webhookEntryTime,
        contactMap,
      )
    }

    for (const status of payload.statuses ?? []) {
      if (status.type === 'payment') continue
      await this.ingestStatus(status, contactMap, webhookEntryTime)
    }

    for (const echo of payload.message_echoes ?? []) {
      const message = normalizeStandbyMessageEcho(
        echo,
        this.channel.waPhoneNumber,
      )
      await this.ingestMessage(
        message,
        'message_echo',
        'outbound',
        webhookEntryTime,
        message.to,
        undefined,
        undefined,
        echo,
        true,
      )
    }
  }

  private async ingestMessagingHandovers(
    value: MessagingHandoversValue,
    webhookEntryTime: Date | undefined,
  ): Promise<void> {
    const contact = await this.resolveDirectEventContact(
      value.sender.phone_number,
      new Map(),
    )
    if (!contact) {
      throw new Error('Cannot resolve contact for messaging handover')
    }

    const chatId = await this.upsertDirectChat(contact.id)
    const handover = value.control_passed
    const handledBy = getChatHandlerForHandoverRole(handover.new_owner_role)
    if (handledBy) {
      await this.transaction
        .update(chats)
        .set({ handledBy, updatedAt: new Date() })
        .where(and(eq(chats.id, chatId), ne(chats.handledBy, handledBy)))
    }

    await this.persistChatEvent({
      chatId,
      eventType: 'handover',
      source: 'messaging_handovers',
      deduplicationKey: handoverDeduplicationKey(chatId, value),
      providerEventType: value.type,
      actorContactId: contact.id,
      agentId: handover.previous_owner_app_id,
      previousOwner: handover.previous_owner_role,
      newOwner: handover.new_owner_role,
      providerTimestamp: String(value.timestamp),
      occurredAt: parseRequiredTimestamp(value.timestamp),
      webhookEntryTime,
      rawEvent: value,
    })
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
    rawMessage: StoredWhatsAppMessagePayload = message,
    aiGenerated = false,
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

    const sourceHandler = getChatHandlerForMessageSource(source)
    if (sourceHandler) {
      await this.transaction
        .update(chats)
        .set({ handledBy: sourceHandler, updatedAt: new Date() })
        .where(and(eq(chats.id, chatId), ne(chats.handledBy, sourceHandler)))
    }

    const effectiveHandler =
      sourceHandler ??
      (direction === 'inbound' ? await this.findChatHandler(chatId) : undefined)

    const messageType = normalizeMessageType(message.type)
    const contentProjection = projectWhatsAppMessageContent(message)
    const mediaFilePath = this.mediaFilePaths.get(message.id)
    const occurredAt = parseOptionalTimestamp(message.timestamp)
    const recipientId =
      direction === 'outbound'
        ? (getString(record, 'to') ?? remoteIdentity)
        : (providerGroupId ?? this.channel.waPhoneNumber)
    const now = new Date()
    const initialStatus = getInitialMessageStatus(direction, effectiveHandler)
    const isReadByAgent = direction === 'inbound' && initialStatus === 'read'
    const values = {
      chatId,
      contactId,
      providerMessageId: message.id,
      source,
      direction,
      aiGenerated,
      messageType,
      interactiveType: getInteractiveType(record),
      ...contentProjection,
      ...(mediaFilePath ? { mediaFilePath } : {}),
      dispatchStatus:
        source === 'message_echo' ? ('accepted' as const) : undefined,
      status: initialStatus,
      statusUpdatedAt: initialStatus ? now : undefined,
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
      rawMessage,
      updatedAt: now,
    }

    let [storedMessage] = await this.transaction
      .insert(messages)
      .values(values)
      .onConflictDoNothing({ target: messages.providerMessageId })
      .returning({
        id: messages.id,
        chatId: messages.chatId,
        contactId: messages.contactId,
      })
    const wasInserted = Boolean(storedMessage)

    if (!storedMessage) {
      ;[storedMessage] = await this.transaction
        .update(messages)
        .set({
          ...values,
          status:
            initialStatus === 'read'
              ? sql<StoredMessageStatus>`case
                  when ${messages.status} is null or ${messages.status} = 'delivered'
                    then 'read'
                  else ${messages.status}
                end`
              : initialStatus
                ? sql<StoredMessageStatus>`coalesce(${messages.status}, ${initialStatus})`
                : undefined,
          statusUpdatedAt:
            initialStatus === 'read'
              ? sql<Date>`case
                  when ${messages.status} is null or ${messages.status} = 'delivered'
                    then ${now}
                  else ${messages.statusUpdatedAt}
                end`
              : initialStatus
                ? sql<Date>`coalesce(${messages.statusUpdatedAt}, ${now})`
                : undefined,
        })
        .where(eq(messages.providerMessageId, message.id))
        .returning({
          id: messages.id,
          chatId: messages.chatId,
          contactId: messages.contactId,
        })
    }

    if (!storedMessage)
      throw new Error(`Failed to persist message ${message.id}`)

    if (wasInserted || isReadByAgent) {
      await this.advanceLatestMessage(
        storedMessage.chatId,
        storedMessage.id,
        wasInserted && direction === 'inbound' && !isReadByAgent,
        isReadByAgent,
      )
    }
    this.summary.messages += 1
    this.recordUpdate(storedMessage.chatId, 'message.created')
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

      const wasInserted = Boolean(storedMessage)
      storedMessage ??= await this.findMessageByProviderId(status.id)
      if (!storedMessage) {
        throw new Error(`Failed to persist status-first message ${status.id}`)
      }

      if (wasInserted) {
        await this.advanceLatestMessage(storedMessage.chatId, storedMessage.id)
      }
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
    this.recordUpdate(storedMessage.chatId, 'message.status.updated')
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
    this.recordUpdate(event.chatId, 'conversation.updated')
  }

  private recordUpdate(chatId: number, type: WhatsAppChatUpdateType): void {
    const key = `${chatId}:${type}`
    if (this.updateKeys.has(key)) return
    this.updateKeys.add(key)
    this.summary.updates.push({ chatId, type })
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
    let existing = cached
    if (!existing && waId) {
      ;[existing] = await this.transaction
        .select({
          id: contacts.id,
          waId: contacts.waId,
          userId: contacts.userId,
        })
        .from(contacts)
        .where(
          and(eq(contacts.channelId, this.channel.id), eq(contacts.waId, waId)),
        )
        .limit(1)
    }
    if (!existing && userId) {
      ;[existing] = await this.transaction
        .select({
          id: contacts.id,
          waId: contacts.waId,
          userId: contacts.userId,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.channelId, this.channel.id),
            eq(contacts.userId, userId),
          ),
        )
        .limit(1)
    }
    const values = {
      channelId: this.channel.id,
      waId,
      userId,
      parentUserId: getString(record, 'parent_user_id'),
      identityKeyHash: getString(record, 'identity_key_hash'),
      input: getString(record, 'input'),
      ...(profile && getString(profile, 'name') !== undefined
        ? { profileName: getString(profile, 'name') }
        : {}),
      ...(profile && getString(profile, 'username') !== undefined
        ? { profileUsername: getString(profile, 'username') }
        : {}),
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
              or(
                ...(waId ? [eq(contacts.waId, waId)] : []),
                ...(userId ? [eq(contacts.userId, userId)] : []),
              ),
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
      .values({
        kind: 'direct',
        channelId: this.channel.id,
        organizationId: this.channel.organizationId,
        contactId,
      })
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
      .values({
        kind: 'group',
        channelId: this.channel.id,
        organizationId: this.channel.organizationId,
        groupId,
      })
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

  private async findChatHandler(chatId: number): Promise<ChatHandler> {
    const [chat] = await this.transaction
      .select({ handledBy: chats.handledBy })
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1)
    if (!chat) throw new Error(`Cannot resolve handler for chat ${chatId}`)
    return chat.handledBy
  }

  private async advanceLatestMessage(
    chatId: number,
    messageId: number,
    incrementUnread = false,
    markRead = false,
  ): Promise<void> {
    await this.transaction
      .update(chats)
      .set({
        latestMessageId: sql`case
          when ${chats.latestMessageId} is null or ${chats.latestMessageId} < ${messageId}
            then ${messageId}
          else ${chats.latestMessageId}
        end`,
        updatedAt: new Date(),
        ...(markRead
          ? {
              latestReadMessageId: sql`case
                when ${chats.latestReadMessageId} is null or ${chats.latestReadMessageId} < ${messageId}
                  then ${messageId}
                else ${chats.latestReadMessageId}
              end`,
              unreadMessageCount: 0,
            }
          : {}),
        ...(incrementUnread
          ? {
              unreadMessageCount: sql`${chats.unreadMessageCount} + 1`,
            }
          : {}),
      })
      .where(eq(chats.id, chatId))
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
      organizationId: channels.organizationId,
      type: channels.type,
      waAppSecret: channels.waAppSecret,
      waWebhookVerifyToken: channels.waWebhookVerifyToken,
      webhookForwardUrls: channels.webhookForwardUrls,
      waPhoneNumber: channels.waPhoneNumber,
      waPhoneNumberId: channels.waPhoneNumberId,
      waSystemUserAccessToken: channels.waSystemUserAccessToken,
      waWabaId: channels.waWabaId,
    })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.type, 'whatsapp')))
    .limit(1)
  return channel
}

export function getChatHandlerForMessageSource(
  source: WhatsAppMessageSource,
): ChatHandler | undefined {
  if (source === 'standby') return 'mba'
  if (source === 'messages') return 'application'
  return undefined
}

export function getChatHandlerForHandoverRole(
  role: string,
): ChatHandler | undefined {
  if (role === 'ai_agent') return 'mba'
  if (role === 'escalation') return 'application'
  return undefined
}

export function getInitialMessageStatus(
  direction: 'inbound' | 'outbound',
  handledBy?: ChatHandler,
): StoredMessageStatus | undefined {
  if (direction === 'outbound') return undefined
  return handledBy === 'mba' ? 'read' : 'delivered'
}

const messageTypeSet = new Set<string>(whatsappMessageTypes)

function normalizeStandbyMessageEcho(
  echo: StandbyMessageEcho,
  businessPhoneNumber: string,
): MessageEcho {
  return {
    ...echo.message,
    id: echo.id,
    timestamp: String(echo.timestamp),
    from: businessPhoneNumber,
  }
}

function handoverDeduplicationKey(
  chatId: number,
  event: MessagingHandoverEvent,
): string {
  const handover = event.control_passed
  return [
    chatId,
    'messaging_handovers',
    event.type,
    String(event.timestamp),
    handover.previous_owner_role,
    handover.new_owner_role,
    handover.previous_owner_app_id ?? '',
    handover.metadata ?? '',
  ].join(':')
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

export function projectWhatsAppMessageContent(
  message: ProjectableWhatsAppMessage,
): WhatsAppMessageContentProjection {
  const record = asRecord(message)
  const editData = getRecord(record, 'edit')
  const editedMessage = editData ? getRecord(editData, 'message') : undefined
  const content = editedMessage ?? record
  const interactiveData = getRecord(content, 'interactive')
  const contactData = getArray(content, 'contacts')
  const locationData = getRecord(content, 'location')
  const buttonData = getRecord(content, 'button')
  const orderData = getRecord(content, 'order')
  const reactionData = getRecord(content, 'reaction')
  const templateData = getRecord(content, 'template')
  const systemData = getRecord(content, 'system')
  const revokeData = getRecord(record, 'revoke')
  const mediaData = getMediaData(content, interactiveData)
  const contextData =
    getRecord(content, 'context') ?? getRecord(record, 'context')

  return {
    textContent: getTextContent(content),
    mediaId: mediaData ? (getString(mediaData, 'id') ?? null) : null,
    mediaUrl: mediaData
      ? (getString(mediaData, 'url') ?? getString(mediaData, 'link') ?? null)
      : null,
    mediaMimeType: mediaData
      ? (getString(mediaData, 'mime_type') ?? null)
      : null,
    mediaSha256: mediaData ? (getString(mediaData, 'sha256') ?? null) : null,
    mediaFileName: mediaData
      ? (getString(mediaData, 'filename') ?? null)
      : null,
    mediaCaption: mediaData ? (getString(mediaData, 'caption') ?? null) : null,
    mediaVoice: mediaData ? (getBoolean(mediaData, 'voice') ?? null) : null,
    mediaAnimated: mediaData
      ? (getBoolean(mediaData, 'animated') ?? null)
      : null,
    interactiveData: projectionValue<'interactiveData'>(interactiveData),
    contactData: projectionValue<'contactData'>(contactData),
    locationData: projectionValue<'locationData'>(locationData),
    buttonData: projectionValue<'buttonData'>(buttonData),
    orderData: projectionValue<'orderData'>(orderData),
    reactionData: projectionValue<'reactionData'>(reactionData),
    templateData: projectionValue<'templateData'>(templateData),
    systemData: projectionValue<'systemData'>(systemData),
    editData: projectionValue<'editData'>(editData),
    revokeData: projectionValue<'revokeData'>(revokeData),
    contextData: projectionValue<'contextData'>(contextData),
    forwarded: contextData
      ? (getBoolean(contextData, 'forwarded') ?? null)
      : null,
    frequentlyForwarded: contextData
      ? (getBoolean(contextData, 'frequently_forwarded') ?? null)
      : null,
    referralData: projectionValue<'referralData'>(
      getRecord(record, 'referral'),
    ),
    identityData: projectionValue<'identityData'>(
      getRecord(record, 'identity'),
    ),
    errorsData: projectionValue<'errorsData'>(getArray(record, 'errors')),
  }
}

function getMediaData(
  message: Record<string, unknown>,
  interactive: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  for (const key of ['audio', 'document', 'image', 'sticker', 'video']) {
    const media = getRecord(message, key)
    if (media) return media
  }

  const header = interactive ? getRecord(interactive, 'header') : undefined
  const headerType = header ? getString(header, 'type') : undefined
  return header && headerType ? getRecord(header, headerType) : undefined
}

function getTextContent(message: Record<string, unknown>): string | null {
  const text = getRecord(message, 'text')
  const button = getRecord(message, 'button')
  const interactive = getRecord(message, 'interactive')
  const buttonReply = interactive
    ? getRecord(interactive, 'button_reply')
    : undefined
  const listReply = interactive
    ? getRecord(interactive, 'list_reply')
    : undefined
  const flowReply = interactive
    ? getRecord(interactive, 'nfm_reply')
    : undefined
  const interactiveBody = interactive
    ? getRecord(interactive, 'body')
    : undefined
  const document = getRecord(message, 'document')
  const image = getRecord(message, 'image')
  const video = getRecord(message, 'video')
  const location = getRecord(message, 'location')
  const order = getRecord(message, 'order')
  const reaction = getRecord(message, 'reaction')
  const system = getRecord(message, 'system')
  const template = getRecord(message, 'template')
  const contacts = getArray(message, 'contacts')
  const firstContact = contacts?.[0] ? asRecord(contacts[0]) : undefined
  const contactName = firstContact ? getRecord(firstContact, 'name') : undefined

  return firstString(
    text && getString(text, 'body'),
    button && getString(button, 'text'),
    buttonReply && getString(buttonReply, 'title'),
    listReply && getString(listReply, 'title'),
    flowReply && getString(flowReply, 'body'),
    interactiveBody && getString(interactiveBody, 'text'),
    document && getString(document, 'caption'),
    document && getString(document, 'filename'),
    image && getString(image, 'caption'),
    video && getString(video, 'caption'),
    location && getString(location, 'name'),
    location && getString(location, 'address'),
    order && getString(order, 'text'),
    reaction && getString(reaction, 'emoji'),
    system && getString(system, 'body'),
    template && getString(template, 'name'),
    contactName && getString(contactName, 'formatted_name'),
  )
}

function projectionValue<Key extends keyof WhatsAppMessageContentProjection>(
  value: unknown,
): WhatsAppMessageContentProjection[Key] {
  return (value ?? null) as WhatsAppMessageContentProjection[Key]
}

function firstString(...values: (string | undefined)[]): string | null {
  return values.find((value): value is string => value !== undefined) ?? null
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
  const metadata =
    getRecord(record, 'metadata') ?? getRecord(record, 'recipient')
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

function getArray(
  record: Record<string, unknown>,
  key: string,
): unknown[] | undefined {
  const value = record[key]
  return Array.isArray(value) ? value : undefined
}

function getString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

const statusRank: Record<StoredMessageStatus, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
  played: 3,
  failed: -1,
  deleted: -1,
}
