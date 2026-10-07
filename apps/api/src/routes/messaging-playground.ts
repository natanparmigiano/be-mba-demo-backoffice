import { createHash, randomUUID } from 'node:crypto'
import { auth } from '@mba-desk/auth'
import { channels, db, member } from '@mba-desk/db'
import { files as defaultFiles, type FileStore } from '@mba-desk/files'
import {
  createWhatsAppMessagingClient,
  whatsappOutboundMessageSchema,
  WhatsAppMessagingApiError,
  WhatsAppMessagingResponseError,
  type SendMessageInput,
  type WhatsAppMessagingClientContract,
} from '@mba-desk/wa-messaging'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const messageActionSchema = z.object({
  messageId: z.string().trim().min(1).max(1_000),
})

const mediaUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[\x20-\x7e]+$/),
  size: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
})

const outboundMessageSchema = whatsappOutboundMessageSchema.superRefine(
  (message, context) => {
    if (!message.to.trim()) {
      context.addIssue({
        code: 'custom',
        message: 'Recipient must not be empty',
        path: ['to'],
      })
    }
  },
)

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface MessagingPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface MessagingPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<MessagingPlaygroundConfiguration | undefined>
}

export interface MessagingPlaygroundRouteOptions {
  createMessagingClient?: (
    configuration: MessagingPlaygroundConfiguration,
  ) => WhatsAppMessagingClientContract
  fileStore?: FileStore
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: MessagingPlaygroundRepository
}

const databaseRepository: MessagingPlaygroundRepository = {
  getConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        phoneNumberId: channels.waPhoneNumberId,
        accessToken: channels.waSystemUserAccessToken,
      })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row
  },
}

export const createMessagingPlaygroundRoute = ({
  createMessagingClient = defaultCreateMessagingClient,
  fileStore = defaultFiles,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: MessagingPlaygroundRouteOptions = {}) =>
  new Hono()
    .post(
      '/:channelId/send',
      zValidator('param', channelParamSchema),
      zValidator('json', outboundMessageSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        const message = withoutMessagingProduct(c.req.valid('json'))
        try {
          const result = await createMessagingClient(
            context.configuration,
          ).send(message, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return messagingError(c, error, {
            channelId: c.req.valid('param').channelId,
            operation: 'send',
            messageType: message.type,
          })
        }
      },
    )
    .post(
      '/:channelId/mark-read',
      zValidator('param', channelParamSchema),
      zValidator('json', messageActionSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        try {
          const result = await createMessagingClient(
            context.configuration,
          ).markAsRead(c.req.valid('json').messageId, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return messagingError(c, error, {
            channelId: c.req.valid('param').channelId,
            operation: 'mark_read',
          })
        }
      },
    )
    .post(
      '/:channelId/typing-indicator',
      zValidator('param', channelParamSchema),
      zValidator('json', messageActionSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        try {
          const result = await createMessagingClient(
            context.configuration,
          ).showTypingIndicator(c.req.valid('json').messageId, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return messagingError(c, error, {
            channelId: c.req.valid('param').channelId,
            operation: 'typing_indicator',
          })
        }
      },
    )
    .post(
      '/:channelId/media-upload',
      zValidator('param', channelParamSchema),
      zValidator('json', mediaUploadSchema),
      async (c) => {
        const channelId = c.req.valid('param').channelId
        const context = await getMutationContext(
          c.req.raw.headers,
          channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        const input = c.req.valid('json')
        const organizationHash = createHash('sha256')
          .update(context.organizationId)
          .digest('hex')
          .slice(0, 16)
        const key = [
          'api-playground',
          organizationHash,
          String(channelId),
          randomUUID(),
          safeFileName(input.fileName),
        ].join('/')

        try {
          const [uploadUrl, mediaUrl] = await Promise.all([
            fileStore.signUrl(key, {
              operation: 'upload',
              contentType: input.contentType,
              expiresInSeconds: 5 * 60,
            }),
            fileStore.signUrl(key, {
              operation: 'download',
              expiresInSeconds: 15 * 60,
            }),
          ])
          return c.json({
            result: {
              uploadUrl,
              mediaUrl,
              contentType: input.contentType,
              expiresInSeconds: 15 * 60,
            },
          })
        } catch {
          return c.json({ message: 'Could not create media upload URLs' }, 502)
        }
      },
    )

async function getMutationContext(
  headers: Headers,
  channelId: number,
  getAccess: NonNullable<MessagingPlaygroundRouteOptions['getAccess']>,
  repository: MessagingPlaygroundRepository,
): Promise<
  | { status: 401 }
  | { status: 403 }
  | { status: 404 }
  | {
      status: 200
      organizationId: string
      configuration: MessagingPlaygroundConfiguration
    }
> {
  const access = await getAccess(headers)
  if (!access) return { status: 401 }
  if (!canManageChannels(access.role)) return { status: 403 }
  const configuration = await repository.getConfiguration(
    access.organizationId,
    channelId,
  )
  return configuration
    ? { status: 200, organizationId: access.organizationId, configuration }
    : { status: 404 }
}

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)

  return membership ? { organizationId, role: membership.role } : undefined
}

function defaultCreateMessagingClient(
  configuration: MessagingPlaygroundConfiguration,
): WhatsAppMessagingClientContract {
  return createWhatsAppMessagingClient({
    accessToken: configuration.accessToken,
    phoneNumberId: configuration.phoneNumberId,
  })
}

function canManageChannels(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
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
  input: z.infer<typeof whatsappOutboundMessageSchema>,
): SendMessageInput {
  const message: Record<string, unknown> = { ...input }
  delete message.messaging_product
  return message as unknown as SendMessageInput
}

function messagingError(
  c: Context,
  error: unknown,
  context: {
    channelId: number
    operation: 'mark_read' | 'send' | 'typing_indicator'
    messageType?: string
  },
) {
  if (error instanceof WhatsAppMessagingApiError) {
    console.error('Meta messaging request failed', {
      ...context,
      providerStatus: error.status,
      providerCode: error.code,
      providerSubcode: error.subcode,
      providerType: error.errorType,
      providerTraceId: error.traceId,
      message: error.message,
    })
    return c.json(
      {
        message: `Meta rejected the messaging request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
        ...(error.errorType === undefined
          ? {}
          : { providerType: error.errorType }),
        ...(error.traceId === undefined
          ? {}
          : { providerTraceId: error.traceId }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppMessagingResponseError) {
    console.error('Meta messaging response validation failed', {
      ...context,
      message: error.message,
    })
    return c.json(
      { message: 'Meta returned an unexpected messaging response' },
      502,
    )
  }
  if (error instanceof TypeError) {
    return c.json({ message: error.message }, 400)
  }
  console.error('Meta messaging request could not be completed', {
    ...context,
    errorName: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : 'Unknown error',
  })
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
