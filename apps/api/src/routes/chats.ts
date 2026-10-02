import { createHash, randomUUID } from 'node:crypto'
import { auth } from '@mba-demo/auth'
import {
  channels,
  chatEvents,
  chats,
  contacts,
  db,
  groups,
  member,
  messages,
  persistWhatsAppOutboundMessage,
} from '@mba-demo/db'
import { files as defaultFiles, type FileStore } from '@mba-demo/files'
import {
  createWhatsAppMediaClient,
  MEDIA_SIZE_LIMIT_BYTES,
  WhatsAppMediaApiError,
  WhatsAppMediaResponseError,
  type UploadMediaInput,
  type UploadMediaResponse,
} from '@mba-demo/wa-media'
import {
  createWhatsAppMbaClient,
  WhatsAppMbaApiError,
  WhatsAppMbaResponseError,
} from '@mba-demo/wa-mba'
import {
  createWhatsAppMessagingClient,
  whatsappOutboundMessageSchema,
  whatsappSendMessageResponseSchema,
  WhatsAppMessagingApiError,
  WhatsAppMessagingResponseError,
  type SendMessageInput,
  type WhatsAppOutboundMessage,
  type WhatsAppSendMessageResponse,
} from '@mba-demo/wa-messaging'
import {
  createWhatsAppTemplatesClient,
  WhatsAppTemplatesApiError,
  WhatsAppTemplatesResponseError,
  type TemplateComponent as WhatsAppTemplateComponent,
  type TemplatePage,
} from '@mba-demo/wa-templates'
import { pubsub } from '@mba-demo/pubsub'
import { zValidator } from '@hono/zod-validator'
import {
  and,
  desc,
  eq,
  isNotNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE, type SSEMessage } from 'hono/streaming'
import { z } from 'zod'
import {
  chatInboxRealtimeChannel,
  chatRealtimeChannel,
  publishChatRealtimeEventSafely,
  type ChatRealtime,
} from '../chat-realtime.js'

const DEFAULT_CHAT_PAGE_SIZE = 30
const DEFAULT_TIMELINE_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const listChatsQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_CHAT_PAGE_SIZE),
})

const timelineQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_TIMELINE_PAGE_SIZE),
})

const templatesQuerySchema = z.object({
  after: z.string().trim().min(1).max(2_000).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(100),
})

const handoffBodySchema = z.object({
  handledBy: z.enum(['mba', 'application']),
})

const chatMessageSchema = z.object({
  clientMessageId: z.string().uuid(),
  templatePreview: z.string().trim().min(1).max(10_000).optional(),
  mediaFilePath: z.string().min(1).max(1_024).optional(),
  mediaMimeType: z.string().min(1).max(255).optional(),
  message: whatsappOutboundMessageSchema,
})

const mediaUploadSchema = z.discriminatedUnion('kind', [
  mediaUploadVariant('audio', [
    'audio/aac',
    'audio/amr',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
  ]).extend({ voice: z.literal(true).optional() }),
  mediaUploadVariant('document', [
    'application/msword',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]),
  mediaUploadVariant('image', ['image/jpeg', 'image/png']),
  mediaUploadVariant('sticker', ['image/webp']),
  mediaUploadVariant('video', ['video/3gpp', 'video/mp4']),
])

const completeMediaUploadSchema = mediaUploadSchema.and(
  z.object({ key: z.string().min(1).max(1_024) }),
)

function mediaUploadVariant<
  Kind extends keyof typeof MEDIA_SIZE_LIMIT_BYTES,
  Mime extends string,
>(kind: Kind, mimeTypes: readonly [Mime, ...Mime[]]) {
  return z.object({
    kind: z.literal(kind),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.enum(mimeTypes),
    size: z.number().int().positive().max(MEDIA_SIZE_LIMIT_BYTES[kind]),
  })
}

const chatCursorSchema = z.object({
  id: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
})

const timelineCursorSchema = z.object({
  id: z.number().int().positive(),
  itemType: z.enum(['event', 'message']),
  occurredAt: z.string().datetime({ offset: true }),
})

interface OrganizationAccess {
  organizationId: string
}

interface ChatCursor {
  id: number
  updatedAt: string
}

interface TimelineCursor {
  id: number
  itemType: 'event' | 'message'
  occurredAt: string
}

type StoredMessage = typeof messages.$inferSelect

export interface ChatSummary {
  id: number
  kind: 'direct' | 'group'
  handledBy: 'mba' | 'application'
  updatedAt: string
  unreadMessageCount: number
  latestInboundMessageAt: string | null
  channel: {
    id: number
    waPhoneNumber: string
  }
  contact: {
    id: number
    profileName: string | null
    profileUsername: string | null
    waId: string | null
    userId: string | null
  } | null
  group: {
    id: number
    providerGroupId: string | null
    subject: string | null
  } | null
  latestMessage: {
    id: number
    direction: 'inbound' | 'outbound'
    messageType: string | null
    occurredAt: string | null
    preview: string | null
  } | null
}

export interface ChatMessageTimelineItem {
  itemType: 'message'
  id: number
  providerMessageId: string | null
  targetMessageId: string | null
  occurredAt: string
  direction: 'inbound' | 'outbound'
  aiGenerated: boolean
  messageType: StoredMessage['messageType']
  interactiveType: StoredMessage['interactiveType']
  status: StoredMessage['status']
  forwarded: boolean | null
  frequentlyForwarded: boolean | null
  text: string | null
  media: {
    id: string | null
    url: string | null
    mimeType: string | null
    fileName: string | null
    caption: string | null
    voice: boolean | null
    animated: boolean | null
  } | null
  interactiveData: StoredMessage['interactiveData']
  contactData: StoredMessage['contactData']
  locationData: StoredMessage['locationData']
  buttonData: StoredMessage['buttonData']
  orderData: StoredMessage['orderData']
  reactionData: StoredMessage['reactionData']
  templateData: StoredMessage['templateData']
  systemData: StoredMessage['systemData']
  editData: StoredMessage['editData']
  revokeData: StoredMessage['revokeData']
  sender: {
    profileName: string | null
    profileUsername: string | null
    waId: string | null
    userId: string | null
  } | null
}

export interface ChatEventTimelineItem {
  itemType: 'event'
  id: number
  occurredAt: string
  eventType: string
  providerEventType: string | null
  agentName: string | null
  previousOwner: string | null
  newOwner: string | null
}

export type ChatTimelineItem = ChatMessageTimelineItem | ChatEventTimelineItem

interface ChatListQuery {
  cursor?: ChatCursor
  limit: number
}

interface TimelineQuery {
  cursor?: TimelineCursor
  limit: number
}

interface ChatListResult {
  chats: ChatSummary[]
  nextCursor: string | null
}

interface TimelineResult {
  items: ChatTimelineItem[]
  nextCursor: string | null
}

export interface ChatHandoffContext {
  handledBy: 'mba' | 'application'
  recipient: string | null
  waPhoneNumberId: string
  waSystemUserAccessToken: string
}

export interface ChatReadContext {
  messageId: string | null
  waPhoneNumberId: string
  waSystemUserAccessToken: string
}

export interface ChatSendContext {
  accessToken: string
  contactId: number | null
  handledBy: 'mba' | 'application'
  kind: 'direct' | 'group'
  organizationId: string
  phoneNumberId: string
  recipient: string | null
}

export interface ChatTemplateContext {
  accessToken: string
  wabaId: string
}

export interface ChatTemplateDefinition {
  id: string
  name: string
  language: string
  category: string | null
  parameterFormat: 'NAMED' | 'POSITIONAL'
  components: WhatsAppTemplateComponent[]
}

type ChatHandler = ChatHandoffContext['handledBy']

export type ChatHandoffService = (
  context: ChatHandoffContext,
  handledBy: ChatHandler,
) => Promise<void>

export type ChatReadService = (context: ChatReadContext) => Promise<void>
export type ChatSendService = (
  context: ChatSendContext,
  message: SendMessageInput,
) => Promise<WhatsAppSendMessageResponse>
export type ChatMediaUploadService = (
  context: ChatSendContext,
  input: UploadMediaInput,
) => Promise<UploadMediaResponse>
export type ChatTemplatesService = (
  context: ChatTemplateContext,
  query: { after?: string; limit: number },
) => Promise<TemplatePage>

export interface ChatsRepository {
  get: (
    organizationId: string,
    chatId: number,
  ) => Promise<ChatSummary | undefined>
  list: (
    organizationId: string,
    query: ChatListQuery,
  ) => Promise<ChatListResult>
  timeline: (
    organizationId: string,
    chatId: number,
    query: TimelineQuery,
  ) => Promise<TimelineResult | undefined>
  markRead: (organizationId: string, chatId: number) => Promise<boolean>
  getReadContext: (
    organizationId: string,
    chatId: number,
  ) => Promise<ChatReadContext | undefined>
  getSendContext: (
    organizationId: string,
    chatId: number,
  ) => Promise<ChatSendContext | undefined>
  getTemplateContext: (
    organizationId: string,
    chatId: number,
  ) => Promise<ChatTemplateContext | undefined>
  getHandoffContext: (
    organizationId: string,
    chatId: number,
  ) => Promise<ChatHandoffContext | undefined>
  setHandler: (
    organizationId: string,
    chatId: number,
    handledBy: ChatHandler,
  ) => Promise<boolean>
  owns: (organizationId: string, chatId: number) => Promise<boolean>
}

export interface ChatsRouteOptions {
  fileStore?: Pick<FileStore, 'get' | 'signUrl'>
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  handoff?: ChatHandoffService
  markProviderRead?: ChatReadService
  persistMessage?: typeof persistWhatsAppOutboundMessage
  sendMessage?: ChatSendService
  listTemplates?: ChatTemplatesService
  uploadMedia?: ChatMediaUploadService
  realtime?: ChatRealtime
  repository?: ChatsRepository
}

export const createChatsRoute = ({
  fileStore = defaultFiles,
  getAccess = getOrganizationAccess,
  handoff = transferChatControl,
  markProviderRead = markChatMessageRead,
  persistMessage = persistWhatsAppOutboundMessage,
  sendMessage = sendChatMessage,
  listTemplates = listApprovedChatTemplates,
  uploadMedia = uploadChatMedia,
  realtime = pubsub,
  repository,
}: ChatsRouteOptions = {}) => {
  const resolvedRepository: ChatsRepository = repository ?? {
    get: getChat,
    getHandoffContext,
    getReadContext: getChatReadContext,
    getSendContext: getChatSendContext,
    getTemplateContext: getChatTemplateContext,
    list: listChats,
    markRead: markChatRead,
    owns: ownsChat,
    setHandler: setChatHandler,
    timeline: (organizationId, chatId, query) =>
      getChatTimeline(organizationId, chatId, query, fileStore),
  }

  return new Hono()
    .get(
      '/',
      zValidator('query', listChatsQuerySchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid chats query' }, 400)
        }
      }),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)

        const query = c.req.valid('query')
        const cursor = query.cursor ? decodeChatCursor(query.cursor) : undefined
        if (query.cursor && !cursor) {
          return c.json({ message: 'Invalid cursor' }, 400)
        }

        return c.json(
          await resolvedRepository.list(access.organizationId, {
            cursor,
            limit: query.limit,
          }),
        )
      },
    )
    .get('/events', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      c.header('Cache-Control', 'no-cache, no-transform')
      c.header('X-Accel-Buffering', 'no')

      return streamSSE(c, async (stream) => {
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let unsubscribe:
          Awaited<ReturnType<ChatRealtime['subscribe']>> | undefined
        let writeQueue = Promise.resolve()
        const write = (message: SSEMessage): Promise<void> => {
          const pending = writeQueue.then(() => stream.writeSSE(message))
          writeQueue = pending.catch(() => undefined)
          return pending
        }
        const aborted = new Promise<void>((resolve) => {
          stream.onAbort(resolve)
        })

        try {
          unsubscribe = await realtime.subscribe(
            chatInboxRealtimeChannel(access.organizationId),
            async (message) => {
              try {
                await write({ event: 'chat-update', data: message.value })
              } catch {
                stream.abort()
              }
            },
          )
          await realtime.start()
          await write({
            event: 'ready',
            data: JSON.stringify({ organizationId: access.organizationId }),
            retry: 2_000,
          })
          heartbeat = setInterval(() => {
            void write({
              event: 'heartbeat',
              data: new Date().toISOString(),
            }).catch(() => stream.abort())
          }, 15_000)
          await aborted
        } finally {
          if (heartbeat) clearInterval(heartbeat)
          await unsubscribe?.()
        }
      })
    })
    .get('/:id', async (c) => {
      const chatId = parsePositiveSafeInteger(c.req.param('id'))
      if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      const chat = await resolvedRepository.get(access.organizationId, chatId)
      if (!chat) return c.json({ message: 'Chat not found' }, 404)
      return c.json({ chat })
    })
    .get(
      '/:id/templates',
      zValidator('query', templatesQuerySchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid templates query' }, 400)
        }
      }),
      async (c) => {
        const chatId = parsePositiveSafeInteger(c.req.param('id'))
        if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const context = await resolvedRepository.getTemplateContext(
          access.organizationId,
          chatId,
        )
        if (!context) return c.json({ message: 'Chat not found' }, 404)

        try {
          const page = await listTemplates(context, c.req.valid('query'))
          const templates: ChatTemplateDefinition[] = page.data.flatMap(
            (template) =>
              template.name && template.language
                ? [
                    {
                      id: template.id,
                      name: template.name,
                      language: template.language,
                      category: template.category ?? null,
                      parameterFormat:
                        template.parameter_format ?? 'POSITIONAL',
                      components: template.components ?? [],
                    },
                  ]
                : [],
          )
          return c.json({
            templates,
            nextCursor:
              page.paging?.next && page.paging.cursors?.after
                ? page.paging.cursors.after
                : null,
          })
        } catch (error) {
          if (error instanceof WhatsAppTemplatesApiError) {
            return c.json(
              { message: 'Meta rejected the templates request' },
              502,
            )
          }
          if (error instanceof WhatsAppTemplatesResponseError) {
            return c.json(
              { message: 'Meta returned an unexpected templates response' },
              502,
            )
          }
          return c.json({ message: 'Could not load WhatsApp templates' }, 502)
        }
      },
    )
    .get(
      '/:id/timeline',
      zValidator('query', timelineQuerySchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid timeline query' }, 400)
        }
      }),
      async (c) => {
        const chatId = parsePositiveSafeInteger(c.req.param('id'))
        if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)

        const query = c.req.valid('query')
        const cursor = query.cursor
          ? decodeTimelineCursor(query.cursor)
          : undefined
        if (query.cursor && !cursor) {
          return c.json({ message: 'Invalid cursor' }, 400)
        }

        const result = await resolvedRepository.timeline(
          access.organizationId,
          chatId,
          { cursor, limit: query.limit },
        )
        if (!result) return c.json({ message: 'Chat not found' }, 404)
        return c.json(result)
      },
    )
    .get('/:id/events', async (c) => {
      const chatId = parsePositiveSafeInteger(c.req.param('id'))
      if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!(await resolvedRepository.owns(access.organizationId, chatId))) {
        return c.json({ message: 'Chat not found' }, 404)
      }

      c.header('Cache-Control', 'no-cache, no-transform')
      c.header('X-Accel-Buffering', 'no')

      return streamSSE(c, async (stream) => {
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let unsubscribe:
          Awaited<ReturnType<ChatRealtime['subscribe']>> | undefined
        let writeQueue = Promise.resolve()
        const write = (message: SSEMessage): Promise<void> => {
          const pending = writeQueue.then(() => stream.writeSSE(message))
          writeQueue = pending.catch(() => undefined)
          return pending
        }
        const aborted = new Promise<void>((resolve) => {
          stream.onAbort(resolve)
        })

        try {
          unsubscribe = await realtime.subscribe(
            chatRealtimeChannel(chatId),
            async (message) => {
              try {
                await write({ event: 'chat-update', data: message.value })
              } catch {
                stream.abort()
              }
            },
          )
          await realtime.start()
          await write({
            event: 'ready',
            data: JSON.stringify({ chatId }),
            retry: 2_000,
          })
          heartbeat = setInterval(() => {
            void write({
              event: 'heartbeat',
              data: new Date().toISOString(),
            }).catch(() => stream.abort())
          }, 15_000)
          await aborted
        } finally {
          if (heartbeat) clearInterval(heartbeat)
          await unsubscribe?.()
        }
      })
    })
    .post(
      '/:id/media-upload',
      zValidator('json', mediaUploadSchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid media upload request' }, 400)
        }
      }),
      async (c) => {
        const chatId = parsePositiveSafeInteger(c.req.param('id'))
        if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const context = await resolvedRepository.getSendContext(
          access.organizationId,
          chatId,
        )
        if (!context) return c.json({ message: 'Chat not found' }, 404)
        if (context.handledBy !== 'application') {
          return c.json(
            { message: 'Conversation is currently handled by AI' },
            409,
          )
        }

        const input = c.req.valid('json')
        if (
          input.kind === 'audio' &&
          input.voice &&
          input.contentType !== 'audio/ogg'
        ) {
          return c.json({ message: 'Voice messages must use OGG audio' }, 400)
        }
        const key = `${chatMediaPrefix(access.organizationId, chatId)}/${randomUUID()}/${safeFileName(input.fileName)}`
        try {
          const uploadUrl = await fileStore.signUrl(key, {
            operation: 'upload',
            contentType: input.contentType,
            expiresInSeconds: 5 * 60,
          })
          return c.json({
            result: {
              key,
              uploadUrl,
              contentType: input.contentType,
              expiresInSeconds: 5 * 60,
            },
          })
        } catch {
          return c.json({ message: 'Could not create media upload URL' }, 502)
        }
      },
    )
    .post(
      '/:id/media',
      zValidator('json', completeMediaUploadSchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid media completion request' }, 400)
        }
      }),
      async (c) => {
        const chatId = parsePositiveSafeInteger(c.req.param('id'))
        if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const context = await resolvedRepository.getSendContext(
          access.organizationId,
          chatId,
        )
        if (!context) return c.json({ message: 'Chat not found' }, 404)
        if (context.handledBy !== 'application') {
          return c.json(
            { message: 'Conversation is currently handled by AI' },
            409,
          )
        }

        const input = c.req.valid('json')
        if (
          input.kind === 'audio' &&
          input.voice &&
          input.contentType !== 'audio/ogg'
        ) {
          return c.json({ message: 'Voice messages must use OGG audio' }, 400)
        }
        if (!isChatMediaKey(input.key, access.organizationId, chatId)) {
          return c.json(
            { message: 'Media upload does not belong to this chat' },
            400,
          )
        }
        const stored = await fileStore.get(input.key)
        if (!stored)
          return c.json({ message: 'Uploaded media was not found' }, 404)
        if (
          stored.size !== input.size ||
          stored.size > MEDIA_SIZE_LIMIT_BYTES[input.kind] ||
          (stored.contentType && stored.contentType !== input.contentType)
        ) {
          return c.json(
            { message: 'Uploaded media does not match its metadata' },
            400,
          )
        }

        try {
          const result = await uploadMedia(context, {
            kind: input.kind,
            file: new Blob([stored.body.slice().buffer], {
              type: input.contentType,
            }),
            filename: input.fileName,
            mimeType: input.contentType,
          } as UploadMediaInput)
          return c.json({
            result: {
              id: result.id,
              key: input.key,
              contentType: input.contentType,
              fileName: input.fileName,
            },
          })
        } catch (error) {
          if (error instanceof WhatsAppMediaApiError) {
            return c.json({ message: 'Meta rejected the media upload' }, 502)
          }
          if (error instanceof WhatsAppMediaResponseError) {
            return c.json(
              { message: 'Meta returned an unexpected media response' },
              502,
            )
          }
          if (error instanceof TypeError || error instanceof RangeError) {
            return c.json({ message: error.message }, 400)
          }
          return c.json({ message: 'Could not upload media to Meta' }, 502)
        }
      },
    )
    .post(
      '/:id/messages',
      zValidator('json', chatMessageSchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid message request' }, 400)
        }
      }),
      async (c) => {
        const chatId = parsePositiveSafeInteger(c.req.param('id'))
        if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const context = await resolvedRepository.getSendContext(
          access.organizationId,
          chatId,
        )
        if (!context) return c.json({ message: 'Chat not found' }, 404)
        if (context.handledBy !== 'application') {
          return c.json(
            { message: 'Conversation is currently handled by AI' },
            409,
          )
        }
        if (!context.recipient) {
          return c.json({ message: 'Chat has no provider recipient' }, 409)
        }

        const input = c.req.valid('json')
        if (input.message.type === 'interactive') {
          return c.json(
            { message: 'Interactive messages are not supported here' },
            400,
          )
        }
        if (
          input.message.type === 'audio' &&
          input.message.audio.voice === true &&
          input.mediaMimeType !== 'audio/ogg'
        ) {
          return c.json({ message: 'Voice messages must use OGG audio' }, 400)
        }
        if (
          input.mediaFilePath &&
          !isChatMediaKey(input.mediaFilePath, access.organizationId, chatId)
        ) {
          return c.json(
            { message: 'Media upload does not belong to this chat' },
            400,
          )
        }

        const outbound = whatsappOutboundMessageSchema.parse({
          ...input.message,
          messaging_product: 'whatsapp',
          to: context.recipient,
          recipient_type: context.kind === 'group' ? 'group' : 'individual',
        })
        try {
          const response = await sendMessage(
            context,
            withoutMessagingProduct(outbound),
          )
          const persisted = await persistMessage({
            chatId,
            clientMessageId: input.clientMessageId,
            contactId: context.contactId ?? undefined,
            mediaFilePath: input.mediaFilePath,
            mediaMimeType: input.mediaMimeType,
            templatePreview: input.templatePreview,
            message: outbound,
            recipientType: context.kind === 'group' ? 'group' : 'individual',
            response,
          })
          await publishChatRealtimeEventSafely(
            realtime,
            access.organizationId,
            chatId,
            'message.created',
          )
          return c.json({ result: { ...persisted, response } }, 201)
        } catch (error) {
          if (error instanceof WhatsAppMessagingApiError) {
            console.error('Meta chat message send failed', {
              chatId,
              organizationId: access.organizationId,
              messageType: outbound.type,
              providerStatus: error.status,
              providerCode: error.code,
              providerSubcode: error.subcode,
              providerType: error.errorType,
              providerTraceId: error.traceId,
              message: error.message,
            })
            return c.json(
              {
                message: `Meta rejected the message: ${error.message}`,
                providerStatus: error.status,
                ...(error.code === undefined
                  ? {}
                  : { providerCode: error.code }),
                ...(error.subcode === undefined
                  ? {}
                  : { providerSubcode: error.subcode }),
                ...(error.traceId === undefined
                  ? {}
                  : { providerTraceId: error.traceId }),
              },
              502,
            )
          }
          if (error instanceof WhatsAppMessagingResponseError) {
            console.error('Meta chat message response validation failed', {
              chatId,
              organizationId: access.organizationId,
              messageType: outbound.type,
              message: error.message,
            })
            return c.json(
              { message: 'Meta returned an unexpected message response' },
              502,
            )
          }
          if (error instanceof TypeError) {
            return c.json({ message: error.message }, 400)
          }
          throw error
        }
      },
    )
    .patch('/:id/read', async (c) => {
      const chatId = parsePositiveSafeInteger(c.req.param('id'))
      if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      const context = await resolvedRepository.getReadContext(
        access.organizationId,
        chatId,
      )
      if (!context) return c.json({ message: 'Chat not found' }, 404)

      if (context.messageId) {
        try {
          await markProviderRead(context)
        } catch (error) {
          if (error instanceof ChatMarkReadError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      }

      const updated = await resolvedRepository.markRead(
        access.organizationId,
        chatId,
      )
      if (!updated) return c.json({ message: 'Chat not found' }, 404)
      await publishChatRealtimeEventSafely(
        realtime,
        access.organizationId,
        chatId,
        'message.status.updated',
      )
      return c.json({ read: true as const })
    })
    .patch(
      '/:id/handoff',
      zValidator('json', handoffBodySchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid handoff request' }, 400)
        }
      }),
      async (c) => {
        const chatId = parsePositiveSafeInteger(c.req.param('id'))
        if (!chatId) return c.json({ message: 'Invalid chat ID' }, 400)

        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)

        const context = await resolvedRepository.getHandoffContext(
          access.organizationId,
          chatId,
        )
        if (!context) return c.json({ message: 'Chat not found' }, 404)

        const { handledBy } = c.req.valid('json')
        if (context.handledBy === handledBy) {
          return c.json({ handledBy })
        }
        if (!context.recipient) {
          return c.json(
            { message: 'Chat has no provider recipient for handoff' },
            409,
          )
        }

        try {
          await handoff(context, handledBy)
        } catch (error) {
          if (error instanceof ChatHandoffError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }

        const updated = await resolvedRepository.setHandler(
          access.organizationId,
          chatId,
          handledBy,
        )
        if (!updated) {
          return c.json(
            { message: 'Conversation handoff could not be synchronized' },
            409,
          )
        }
        await publishChatRealtimeEventSafely(
          realtime,
          access.organizationId,
          chatId,
          'conversation.updated',
        )
        return c.json({ handledBy })
      },
    )
}

async function ownsChat(
  organizationId: string,
  chatId: number,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .limit(1)
  return Boolean(owned)
}

async function listChats(
  organizationId: string,
  query: ChatListQuery,
): Promise<ChatListResult> {
  const conditions: SQL[] = [eq(chats.organizationId, organizationId)]

  if (query.cursor) {
    const cursorDate = new Date(query.cursor.updatedAt)
    const cursorCondition = or(
      lt(chats.updatedAt, cursorDate),
      and(eq(chats.updatedAt, cursorDate), lt(chats.id, query.cursor.id)),
    )
    if (cursorCondition) conditions.push(cursorCondition)
  }

  const rows = await queryChatSummaryRows(conditions, query.limit + 1)

  const pageRows = rows.slice(0, query.limit)
  const lastChat = pageRows.at(-1)

  return {
    chats: pageRows.map(toChatSummary),
    nextCursor:
      rows.length > query.limit && lastChat
        ? encodeChatCursor({
            id: lastChat.id,
            updatedAt: lastChat.updatedAt.toISOString(),
          })
        : null,
  }
}

async function getChat(
  organizationId: string,
  chatId: number,
): Promise<ChatSummary | undefined> {
  const [row] = await queryChatSummaryRows(
    [eq(chats.organizationId, organizationId), eq(chats.id, chatId)],
    1,
  )
  return row ? toChatSummary(row) : undefined
}

async function queryChatSummaryRows(conditions: SQL[], limit: number) {
  return db
    .select({
      id: chats.id,
      kind: chats.kind,
      handledBy: chats.handledBy,
      updatedAt: chats.updatedAt,
      latestMessageId: chats.latestMessageId,
      unreadMessageCount: chats.unreadMessageCount,
      channelId: channels.id,
      channelPhoneNumber: channels.waPhoneNumber,
      contactId: contacts.id,
      contactProfileName: contacts.profileName,
      contactProfileUsername: contacts.profileUsername,
      contactWaId: contacts.waId,
      contactUserId: contacts.userId,
      groupId: groups.id,
      groupProviderId: groups.providerGroupId,
      groupSubject: groups.subject,
      latestMessageDirection: messages.direction,
      latestMessageType: messages.messageType,
      latestMessageOccurredAt: messages.occurredAt,
      latestMessagePreview: messageTextExpression(240),
      latestInboundMessageAt: sql<Date | null>`(
          select max(inbound_message.occurred_at)
          from mba.messages as inbound_message
          where inbound_message.chat_id = ${chats.id}
            and inbound_message.direction = 'inbound'
        )`.mapWith(messages.occurredAt),
    })
    .from(chats)
    .innerJoin(channels, eq(chats.channelId, channels.id))
    .leftJoin(contacts, eq(chats.contactId, contacts.id))
    .leftJoin(groups, eq(chats.groupId, groups.id))
    .leftJoin(messages, eq(chats.latestMessageId, messages.id))
    .where(and(...conditions))
    .orderBy(desc(chats.updatedAt), desc(chats.id))
    .limit(limit)
}

type ChatSummaryRow = Awaited<ReturnType<typeof queryChatSummaryRows>>[number]

function toChatSummary(row: ChatSummaryRow): ChatSummary {
  return {
    id: row.id,
    kind: row.kind,
    handledBy: row.handledBy,
    updatedAt: row.updatedAt.toISOString(),
    unreadMessageCount: row.unreadMessageCount,
    latestInboundMessageAt: row.latestInboundMessageAt?.toISOString() ?? null,
    channel: {
      id: row.channelId,
      waPhoneNumber: row.channelPhoneNumber,
    },
    contact:
      row.contactId !== null
        ? {
            id: row.contactId,
            profileName: row.contactProfileName,
            profileUsername: row.contactProfileUsername,
            waId: row.contactWaId,
            userId: row.contactUserId,
          }
        : null,
    group:
      row.groupId !== null
        ? {
            id: row.groupId,
            providerGroupId: row.groupProviderId,
            subject: row.groupSubject,
          }
        : null,
    latestMessage:
      row.latestMessageId !== null && row.latestMessageDirection
        ? {
            id: row.latestMessageId,
            direction: row.latestMessageDirection,
            messageType: row.latestMessageType,
            occurredAt: row.latestMessageOccurredAt?.toISOString() ?? null,
            preview: row.latestMessagePreview,
          }
        : null,
  }
}

async function markChatRead(
  organizationId: string,
  chatId: number,
): Promise<boolean> {
  return db.transaction(async (transaction) => {
    const now = new Date()
    const [updated] = await transaction
      .update(chats)
      .set({
        latestReadMessageId: chats.latestMessageId,
        unreadMessageCount: 0,
      })
      .where(
        and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)),
      )
      .returning({ id: chats.id })
    if (!updated) return false

    await transaction
      .update(messages)
      .set({ status: 'read', statusUpdatedAt: now, updatedAt: now })
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.direction, 'inbound'),
          eq(messages.status, 'delivered'),
        ),
      )
    return true
  })
}

async function getChatReadContext(
  organizationId: string,
  chatId: number,
): Promise<ChatReadContext | undefined> {
  const [chat] = await db
    .select({
      waPhoneNumberId: channels.waPhoneNumberId,
      waSystemUserAccessToken: channels.waSystemUserAccessToken,
    })
    .from(chats)
    .innerJoin(channels, eq(chats.channelId, channels.id))
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .limit(1)

  if (!chat) return undefined
  const [latestInbound] = await db
    .select({ messageId: messages.providerMessageId })
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.direction, 'inbound'),
        isNotNull(messages.providerMessageId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1)

  return {
    messageId: latestInbound?.messageId ?? null,
    waPhoneNumberId: chat.waPhoneNumberId,
    waSystemUserAccessToken: chat.waSystemUserAccessToken,
  }
}

async function getChatSendContext(
  organizationId: string,
  chatId: number,
): Promise<ChatSendContext | undefined> {
  const [row] = await db
    .select({
      accessToken: channels.waSystemUserAccessToken,
      contactId: chats.contactId,
      contactWaId: contacts.waId,
      contactUserId: contacts.userId,
      groupProviderId: groups.providerGroupId,
      handledBy: chats.handledBy,
      kind: chats.kind,
      phoneNumberId: channels.waPhoneNumberId,
    })
    .from(chats)
    .innerJoin(channels, eq(chats.channelId, channels.id))
    .leftJoin(contacts, eq(chats.contactId, contacts.id))
    .leftJoin(groups, eq(chats.groupId, groups.id))
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .limit(1)

  return row
    ? {
        accessToken: row.accessToken,
        contactId: row.contactId,
        handledBy: row.handledBy,
        kind: row.kind,
        organizationId,
        phoneNumberId: row.phoneNumberId,
        recipient:
          row.contactWaId ?? row.contactUserId ?? row.groupProviderId ?? null,
      }
    : undefined
}

async function getChatTemplateContext(
  organizationId: string,
  chatId: number,
): Promise<ChatTemplateContext | undefined> {
  const [row] = await db
    .select({
      accessToken: channels.waSystemUserAccessToken,
      wabaId: channels.waWabaId,
    })
    .from(chats)
    .innerJoin(channels, eq(chats.channelId, channels.id))
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .limit(1)

  return row
}

async function getHandoffContext(
  organizationId: string,
  chatId: number,
): Promise<ChatHandoffContext | undefined> {
  const [row] = await db
    .select({
      handledBy: chats.handledBy,
      contactWaId: contacts.waId,
      contactUserId: contacts.userId,
      providerGroupId: groups.providerGroupId,
      waPhoneNumberId: channels.waPhoneNumberId,
      waSystemUserAccessToken: channels.waSystemUserAccessToken,
    })
    .from(chats)
    .innerJoin(channels, eq(chats.channelId, channels.id))
    .leftJoin(contacts, eq(chats.contactId, contacts.id))
    .leftJoin(groups, eq(chats.groupId, groups.id))
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .limit(1)

  if (!row) return undefined
  return {
    handledBy: row.handledBy,
    recipient:
      row.contactWaId ?? row.contactUserId ?? row.providerGroupId ?? null,
    waPhoneNumberId: row.waPhoneNumberId,
    waSystemUserAccessToken: row.waSystemUserAccessToken,
  }
}

async function setChatHandler(
  organizationId: string,
  chatId: number,
  handledBy: ChatHandler,
): Promise<boolean> {
  const [updated] = await db
    .update(chats)
    .set({ handledBy, updatedAt: new Date() })
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .returning({ id: chats.id })

  return Boolean(updated)
}

export async function transferChatControl(
  context: ChatHandoffContext,
  handledBy: ChatHandler,
  request: typeof fetch = fetch,
): Promise<void> {
  if (!context.recipient) {
    throw new ChatHandoffError(
      'Chat has no provider recipient for handoff',
      409,
    )
  }

  try {
    const client = createWhatsAppMbaClient({
      accessToken: context.waSystemUserAccessToken,
      phoneNumberId: context.waPhoneNumberId,
      fetch: request,
    })
    await client.transferThreadControl(
      handledBy === 'application'
        ? {
            action: 'take',
            to: context.recipient,
          }
        : {
            action: 'release',
            to: context.recipient,
          },
    )
  } catch (error) {
    if (error instanceof WhatsAppMbaApiError) {
      throw new ChatHandoffError('Meta rejected the conversation handoff', 409)
    }
    if (error instanceof WhatsAppMbaResponseError) {
      throw new ChatHandoffError(
        'Meta returned an unexpected handoff response',
        502,
      )
    }
    throw new ChatHandoffError(
      'Could not reach the Meta Business Agent API',
      502,
    )
  }
}

export async function markChatMessageRead(
  context: ChatReadContext,
  request: typeof fetch = fetch,
): Promise<void> {
  if (!context.messageId) return
  try {
    const client = createWhatsAppMessagingClient({
      accessToken: context.waSystemUserAccessToken,
      phoneNumberId: context.waPhoneNumberId,
      fetch: request,
    })
    await client.markAsRead(context.messageId)
  } catch (error) {
    if (error instanceof WhatsAppMessagingApiError) {
      throw new ChatMarkReadError('Meta rejected the mark-as-read request')
    }
    if (error instanceof WhatsAppMessagingResponseError) {
      throw new ChatMarkReadError(
        'Meta returned an unexpected mark-as-read response',
      )
    }
    throw new ChatMarkReadError('Could not reach the Meta Graph API')
  }
}

export async function sendChatMessage(
  context: ChatSendContext,
  message: SendMessageInput,
): Promise<WhatsAppSendMessageResponse> {
  const response = await createWhatsAppMessagingClient({
    accessToken: context.accessToken,
    phoneNumberId: context.phoneNumberId,
  }).send(message, { signal: AbortSignal.timeout(30_000) })
  return whatsappSendMessageResponseSchema.parse(response)
}

export async function listApprovedChatTemplates(
  context: ChatTemplateContext,
  query: { after?: string; limit: number },
): Promise<TemplatePage> {
  return createWhatsAppTemplatesClient({
    accessToken: context.accessToken,
    wabaId: context.wabaId,
  }).list({
    status: 'APPROVED',
    fields: [
      'id',
      'name',
      'language',
      'status',
      'category',
      'parameter_format',
      'components',
    ],
    limit: query.limit,
    after: query.after,
    signal: AbortSignal.timeout(30_000),
  })
}

export async function uploadChatMedia(
  context: ChatSendContext,
  input: UploadMediaInput,
): Promise<UploadMediaResponse> {
  return createWhatsAppMediaClient({
    accessToken: context.accessToken,
    phoneNumberId: context.phoneNumberId,
  }).upload(input, { signal: AbortSignal.timeout(60_000) })
}

export class ChatMarkReadError extends Error {
  constructor(
    message: string,
    readonly status = 502 as const,
  ) {
    super(message)
  }
}

export class ChatHandoffError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 502,
  ) {
    super(message)
  }
}

function chatMediaPrefix(organizationId: string, chatId: number): string {
  const organizationHash = createHash('sha256')
    .update(organizationId)
    .digest('hex')
    .slice(0, 16)
  return `chat-composer/${organizationHash}/${chatId}`
}

function isChatMediaKey(
  key: string,
  organizationId: string,
  chatId: number,
): boolean {
  return key.startsWith(`${chatMediaPrefix(organizationId, chatId)}/`)
}

function safeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return normalized || 'media'
}

function withoutMessagingProduct(
  input: WhatsAppOutboundMessage,
): SendMessageInput {
  const message: Record<string, unknown> = { ...input }
  delete message.messaging_product
  return message as unknown as SendMessageInput
}

async function getChatTimeline(
  organizationId: string,
  chatId: number,
  query: TimelineQuery,
  fileStore: Pick<FileStore, 'signUrl'>,
): Promise<TimelineResult | undefined> {
  const [ownedChat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.organizationId, organizationId)))
    .limit(1)

  if (!ownedChat) return undefined

  const messageConditions: SQL[] = [
    eq(messages.chatId, chatId),
    isNotNull(messages.occurredAt),
    isNotNull(messages.rawMessage),
  ]
  const eventConditions: SQL[] = [eq(chatEvents.chatId, chatId)]

  if (query.cursor) {
    messageConditions.push(
      timelineBoundary(
        messages.occurredAt,
        messages.id,
        'message',
        query.cursor,
      ),
    )
    eventConditions.push(
      timelineBoundary(
        chatEvents.occurredAt,
        chatEvents.id,
        'event',
        query.cursor,
      ),
    )
  }

  const [messageRows, eventRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        providerMessageId: messages.providerMessageId,
        targetMessageId: messages.targetMessageId,
        occurredAt: messages.occurredAt,
        direction: messages.direction,
        aiGenerated: messages.aiGenerated,
        messageType: messages.messageType,
        interactiveType: messages.interactiveType,
        status: messages.status,
        forwarded: messages.forwarded,
        frequentlyForwarded: messages.frequentlyForwarded,
        text: messageTextExpression(10_000),
        mediaId: messages.mediaId,
        mediaUrl: messages.mediaUrl,
        mediaMimeType: messages.mediaMimeType,
        mediaFilePath: messages.mediaFilePath,
        mediaFileName: messages.mediaFileName,
        mediaCaption: messages.mediaCaption,
        mediaVoice: messages.mediaVoice,
        mediaAnimated: messages.mediaAnimated,
        interactiveData: messages.interactiveData,
        contactData: messages.contactData,
        locationData: messages.locationData,
        buttonData: messages.buttonData,
        orderData: messages.orderData,
        reactionData: messages.reactionData,
        templateData: messages.templateData,
        systemData: messages.systemData,
        editData: messages.editData,
        revokeData: messages.revokeData,
        senderId: contacts.id,
        senderProfileName: contacts.profileName,
        senderProfileUsername: contacts.profileUsername,
        senderWaId: contacts.waId,
        senderUserId: contacts.userId,
      })
      .from(messages)
      .leftJoin(contacts, eq(messages.contactId, contacts.id))
      .where(and(...messageConditions))
      .orderBy(desc(messages.occurredAt), desc(messages.id))
      .limit(query.limit + 1),
    db
      .select({
        id: chatEvents.id,
        occurredAt: chatEvents.occurredAt,
        eventType: chatEvents.eventType,
        providerEventType: chatEvents.providerEventType,
        agentName: chatEvents.agentName,
        previousOwner: chatEvents.previousOwner,
        newOwner: chatEvents.newOwner,
      })
      .from(chatEvents)
      .where(and(...eventConditions))
      .orderBy(desc(chatEvents.occurredAt), desc(chatEvents.id))
      .limit(query.limit + 1),
  ])

  const messageItems = await Promise.all(
    messageRows.flatMap((row) =>
      row.occurredAt
        ? [
            (async (): Promise<ChatMessageTimelineItem> => {
              const mediaUrl = await resolveChatMediaUrl(
                row.mediaFilePath,
                row.mediaUrl,
                fileStore,
              )
              const hasMedia =
                row.mediaId !== null ||
                mediaUrl !== null ||
                row.mediaMimeType !== null ||
                row.mediaFileName !== null ||
                row.mediaCaption !== null

              return {
                itemType: 'message',
                id: row.id,
                providerMessageId: row.providerMessageId,
                targetMessageId: row.targetMessageId,
                occurredAt: row.occurredAt!.toISOString(),
                direction: row.direction,
                aiGenerated: row.aiGenerated,
                messageType: row.messageType,
                interactiveType: row.interactiveType,
                status: row.status,
                forwarded: row.forwarded,
                frequentlyForwarded: row.frequentlyForwarded,
                text: row.text,
                media: hasMedia
                  ? {
                      id: row.mediaId,
                      url: mediaUrl,
                      mimeType: row.mediaMimeType,
                      fileName: row.mediaFileName,
                      caption: row.mediaCaption,
                      voice: row.mediaVoice,
                      animated: row.mediaAnimated,
                    }
                  : null,
                interactiveData: row.interactiveData,
                contactData: row.contactData,
                locationData: row.locationData,
                buttonData: row.buttonData,
                orderData: row.orderData,
                reactionData: row.reactionData,
                templateData: row.templateData,
                systemData: row.systemData,
                editData: row.editData,
                revokeData: row.revokeData,
                sender:
                  row.senderId !== null
                    ? {
                        profileName: row.senderProfileName,
                        profileUsername: row.senderProfileUsername,
                        waId: row.senderWaId,
                        userId: row.senderUserId,
                      }
                    : null,
              }
            })(),
          ]
        : [],
    ),
  )

  const candidates: ChatTimelineItem[] = [
    ...messageItems,
    ...eventRows.map((row) => ({
      itemType: 'event' as const,
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      eventType: row.eventType,
      providerEventType: row.providerEventType,
      agentName: row.agentName,
      previousOwner: row.previousOwner,
      newOwner: row.newOwner,
    })),
  ].sort(compareTimelineItemsDescending)

  const pageItemsDescending = candidates.slice(0, query.limit)
  const lastItem = pageItemsDescending.at(-1)

  return {
    items: pageItemsDescending.reverse(),
    nextCursor:
      candidates.length > query.limit && lastItem
        ? encodeTimelineCursor({
            id: lastItem.id,
            itemType: lastItem.itemType,
            occurredAt: lastItem.occurredAt,
          })
        : null,
  }
}

export async function resolveChatMediaUrl(
  mediaFilePath: string | null,
  providerMediaUrl: string | null,
  fileStore: Pick<FileStore, 'signUrl'>,
): Promise<string | null> {
  return mediaFilePath
    ? fileStore.signUrl(mediaFilePath, { operation: 'download' })
    : providerMediaUrl
}

export function timelineBoundary(
  occurredAt: typeof messages.occurredAt | typeof chatEvents.occurredAt,
  id: typeof messages.id | typeof chatEvents.id,
  itemType: TimelineCursor['itemType'],
  cursor: TimelineCursor,
): SQL {
  const cursorDate = new Date(cursor.occurredAt)
  const itemRank = itemType === 'message' ? 1 : 0
  const cursorRank = cursor.itemType === 'message' ? 1 : 0

  if (itemRank < cursorRank) return lte(occurredAt, cursorDate)
  if (itemRank > cursorRank) return lt(occurredAt, cursorDate)

  const boundary = or(
    lt(occurredAt, cursorDate),
    and(eq(occurredAt, cursorDate), lt(id, cursor.id)),
  )
  if (!boundary) throw new Error('Timeline cursor boundary is empty')
  return boundary
}

export function messageTextExpression(maxLength: number): SQL<string | null> {
  return sql<string | null>`left(coalesce(
    ${messages.textContent},
    ${messages.rawMessage} #>> '{text,body}',
    ${messages.rawMessage} #>> '{message,text,body}',
    ${messages.rawMessage} #>> '{button,text}',
    ${messages.rawMessage} #>> '{interactive,button_reply,title}',
    ${messages.rawMessage} #>> '{interactive,list_reply,title}',
    ${messages.rawMessage} #>> '{interactive,nfm_reply,body}',
    ${messages.rawMessage} #>> '{interactive,body,text}',
    ${messages.rawMessage} #>> '{document,caption}',
    ${messages.rawMessage} #>> '{document,filename}',
    ${messages.rawMessage} #>> '{image,caption}',
    ${messages.rawMessage} #>> '{video,caption}',
    ${messages.rawMessage} #>> '{location,name}',
    ${messages.rawMessage} #>> '{location,address}',
    ${messages.rawMessage} #>> '{reaction,emoji}'
  ), ${maxLength})`
}

function compareTimelineItemsDescending(
  left: ChatTimelineItem,
  right: ChatTimelineItem,
): number {
  const timeComparison = right.occurredAt.localeCompare(left.occurredAt)
  if (timeComparison !== 0) return timeComparison

  const leftRank = left.itemType === 'message' ? 1 : 0
  const rightRank = right.itemType === 'message' ? 1 : 0
  if (leftRank !== rightRank) return rightRank - leftRank
  return right.id - left.id
}

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)

  return membership ? { organizationId } : undefined
}

export function encodeChatCursor(cursor: ChatCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeChatCursor(value: string): ChatCursor | undefined {
  try {
    return chatCursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
  } catch {
    return undefined
  }
}

export function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeTimelineCursor(value: string): TimelineCursor | undefined {
  try {
    return timelineCursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
  } catch {
    return undefined
  }
}

function parsePositiveSafeInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
