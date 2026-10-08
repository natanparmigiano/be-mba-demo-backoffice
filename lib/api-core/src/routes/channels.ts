import { zValidator } from '@hono/zod-validator'
import { auth } from '@mba-desk/auth'
import {
  agentBackups,
  channels,
  chatEvents,
  chats,
  contacts,
  db,
  groups,
  member,
  messages,
  messageStatusEvents,
  runnerAgentMcpConnectors,
  runnerFunctionApiKeys,
  runnerMcps,
  webhooks,
} from '@mba-desk/db'
import { createWhatsAppAnalyticsClient } from '@mba-desk/wa-analytics'
import { createWhatsAppComponentsClient } from '@mba-desk/wa-components'
import { createWhatsAppMbaClient } from '@mba-desk/wa-mba'
import { createWhatsAppQrClient } from '@mba-desk/wa-qr'
import { createWhatsAppRegistrationClient } from '@mba-desk/wa-registration'
import {
  createWhatsAppWebhookRegistrationClient,
  MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
} from '@mba-desk/wa-subscriptions'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

export interface ChannelSummary {
  id: number
  type: 'whatsapp'
  name: string
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  webhookForwardUrls: string[]
  hasWaAppSecret: boolean
  hasWaWebhookVerifyToken: boolean
  hasWaSystemUserAccessToken: boolean
  createdAt: string
  updatedAt: string
}

interface OrganizationAccess {
  organizationId: string
  role: string
}

const requiredText = z.string().trim().min(1).max(500)
const secretText = z.string().trim().min(1).max(10_000)
const webhookForwardUrl = z.string().trim().url().max(2_048).refine(isHttpUrl, {
  message: 'Forward URLs must use HTTP or HTTPS',
})
const webhookForwardUrls = z
  .array(webhookForwardUrl)
  .max(20)
  .refine((urls) => new Set(urls).size === urls.length, {
    message: 'Forward URLs must be unique',
  })

const createChannelSchema = z.object({
  name: requiredText,
  waPhoneNumber: requiredText,
  waPhoneNumberId: requiredText,
  waWabaId: requiredText,
  waBusinessId: requiredText,
  waAppId: requiredText,
  waAppSecret: secretText,
  waWebhookVerifyToken: secretText,
  waSystemUserAccessToken: secretText,
  webhookForwardUrls: webhookForwardUrls.default([]),
})

const updateChannelSchema = createChannelSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one channel field is required',
  })

const deleteChannelSchema = z.object({
  confirmation: z.string().trim().min(1).max(500),
})
const registerPhoneNumberSchema = z.object({ pin: z.string().regex(/^\d{6}$/) })
const qrCodeSchema = z.object({
  prefilledMessage: z.string().trim().min(1).max(1_024),
})
const componentsSchema = z.object({
  prompts: z.array(z.string().trim().min(1).max(80)).max(4),
  commands: z
    .array(
      z.object({
        command_name: z.string().trim().min(1).max(32),
        command_description: z.string().trim().min(1).max(256),
      }),
    )
    .max(30),
})
const businessProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(512),
  about: z.string().trim().max(139),
  address: z.string().trim().max(256),
  description: z.string().trim().max(512),
  email: z.union([z.literal(''), z.string().trim().email().max(128)]),
  vertical: z.enum([
    'UNDEFINED',
    'OTHER',
    'AUTO',
    'BEAUTY',
    'APPAREL',
    'EDU',
    'ENTERTAIN',
    'EVENT_PLAN',
    'FINANCE',
    'GROCERY',
    'GOVT',
    'HOTEL',
    'HEALTH',
    'NONPROFIT',
    'PROF_SERVICES',
    'RETAIL',
    'TRAVEL',
    'RESTAURANT',
  ]),
  websites: z.array(z.string().trim().url().max(256)).max(2),
  profilePictureHandle: z.string().trim().min(1).max(1_024).optional(),
})

type CreateChannelInput = z.infer<typeof createChannelSchema>
type UpdateChannelInput = z.infer<typeof updateChannelSchema>

export interface ChannelAgentConfiguration {
  waPhoneNumberId: string
  waSystemUserAccessToken: string
  waWabaId?: string
  waAppId?: string
}

export interface ChannelDashboardAnalytics {
  period: { start: string; end: string; days: number }
  messaging: {
    sent: number
    delivered: number
    deliveryRate: number | null
    series: Array<{ date: string; sent: number; delivered: number }>
  } | null
  agent: {
    threads: number
    handoffs: number
    handoffRate: number | null
    toolCalls: number
    toolSuccessRate: number | null
    averageToolLatencyMs: number | null
  } | null
  unavailable: Array<'messaging' | 'agent'>
}

export interface ChannelOverviewRepository {
  list(organizationId: string): Promise<ChannelSummary[]>
  create(
    organizationId: string,
    input: CreateChannelInput,
  ): Promise<ChannelSummary>
  update(
    organizationId: string,
    channelId: number,
    input: UpdateChannelInput,
  ): Promise<ChannelSummary | undefined>
  getDeletionPreview(
    organizationId: string,
    channelId: number,
  ): Promise<ChannelDeletionPreview | undefined>
  delete(
    organizationId: string,
    channelId: number,
    confirmation: string,
  ): Promise<ChannelDeletionResult>
  getVerifyToken(
    organizationId: string,
    channelId: number,
  ): Promise<string | undefined>
  getWebhookConfiguration(
    organizationId: string,
    channelId: number,
  ): Promise<ChannelWebhookConfiguration | undefined>
  getAgentConfiguration(
    organizationId: string,
    channelId: number,
  ): Promise<ChannelAgentConfiguration | undefined>
}

export interface ChannelWebhookConfiguration {
  waAppId: string
  waAppSecret: string
  waWebhookVerifyToken: string
}

export interface ChannelDeletionImpact {
  contacts: number
  groups: number
  messages: number
  localMcpAssociations: number
  localMcps: number
}

export interface ChannelDeletionPreview extends ChannelDeletionImpact {
  confirmationText: string
}

export type ChannelDeletionResult =
  | {
      status: 'deleted'
      impact: ChannelDeletionImpact
      backupStoragePaths?: string[]
    }
  | { status: 'confirmation_mismatch' }
  | { status: 'not_found' }

export interface ChannelOverviewRouteOptions {
  applicationUrls?: { workspace: string }
  deleteStoredFiles?: (paths: string[]) => Promise<void>
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ChannelOverviewRepository
  getDashboardAnalytics?: (
    configuration: ChannelAgentConfiguration,
    days: number,
  ) => Promise<ChannelDashboardAnalytics>
}

const safeChannelSelection = {
  id: channels.id,
  type: channels.type,
  name: channels.name,
  waPhoneNumber: channels.waPhoneNumber,
  waPhoneNumberId: channels.waPhoneNumberId,
  waWabaId: channels.waWabaId,
  waBusinessId: channels.waBusinessId,
  waAppId: channels.waAppId,
  webhookForwardUrls: channels.webhookForwardUrls,
  hasWaAppSecret: sql<boolean>`${channels.waAppSecret} <> ''`,
  hasWaWebhookVerifyToken: sql<boolean>`${channels.waWebhookVerifyToken} <> ''`,
  hasWaSystemUserAccessToken: sql<boolean>`${channels.waSystemUserAccessToken} <> ''`,
  createdAt: channels.createdAt,
  updatedAt: channels.updatedAt,
}

const databaseRepository: ChannelOverviewRepository = {
  list: async (organizationId) => {
    const rows = await db
      .select(safeChannelSelection)
      .from(channels)
      .where(eq(channels.organizationId, organizationId))
      .orderBy(channels.createdAt)
    return rows.map(toChannelSummary)
  },
  create: async (organizationId, input) => {
    const [row] = await db
      .insert(channels)
      .values({ ...input, organizationId, type: 'whatsapp' })
      .returning(safeChannelSelection)
    if (!row) throw new Error('Channel was not created')
    return toChannelSummary(row)
  },
  update: async (organizationId, channelId, input) => {
    const [row] = await db
      .update(channels)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .returning(safeChannelSelection)
    return row ? toChannelSummary(row) : undefined
  },
  getDeletionPreview: async (organizationId, channelId) => {
    const [channel] = await db
      .select({ waPhoneNumber: channels.waPhoneNumber })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!channel) return undefined
    const impact = await getDeletionImpact(db, organizationId, channelId)
    return { confirmationText: channel.waPhoneNumber, ...impact }
  },
  delete: async (organizationId, channelId, confirmation) =>
    db.transaction(async (transaction) => {
      const [channel] = await transaction
        .select({ waPhoneNumber: channels.waPhoneNumber })
        .from(channels)
        .where(
          and(
            eq(channels.id, channelId),
            eq(channels.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (!channel) return { status: 'not_found' as const }
      if (confirmation !== channel.waPhoneNumber) {
        return { status: 'confirmation_mismatch' as const }
      }

      const impact = await getDeletionImpact(
        transaction,
        organizationId,
        channelId,
      )
      impact.localMcps = 0
      const associations = await transaction
        .select({
          apiKeyId: runnerAgentMcpConnectors.apiKeyId,
          mcpId: runnerAgentMcpConnectors.mcpId,
        })
        .from(runnerAgentMcpConnectors)
        .where(
          and(
            eq(runnerAgentMcpConnectors.organizationId, organizationId),
            eq(runnerAgentMcpConnectors.channelId, channelId),
          ),
        )
      if (associations.length) {
        await transaction
          .delete(runnerAgentMcpConnectors)
          .where(
            and(
              eq(runnerAgentMcpConnectors.organizationId, organizationId),
              eq(runnerAgentMcpConnectors.channelId, channelId),
            ),
          )
        await transaction
          .update(runnerFunctionApiKeys)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(runnerFunctionApiKeys.organizationId, organizationId),
              inArray(
                runnerFunctionApiKeys.id,
                associations.map(({ apiKeyId }) => apiKeyId),
              ),
            ),
          )
        for (const mcpId of new Set(associations.map(({ mcpId }) => mcpId))) {
          const [remaining] = await transaction
            .select({ channelId: runnerAgentMcpConnectors.channelId })
            .from(runnerAgentMcpConnectors)
            .where(
              and(
                eq(runnerAgentMcpConnectors.organizationId, organizationId),
                eq(runnerAgentMcpConnectors.mcpId, mcpId),
              ),
            )
            .limit(1)
          if (remaining) continue
          await transaction
            .update(runnerFunctionApiKeys)
            .set({
              allowedMcpIds: sql`array_remove(${runnerFunctionApiKeys.allowedMcpIds}, ${mcpId})`,
            })
            .where(
              and(
                eq(runnerFunctionApiKeys.organizationId, organizationId),
                sql`${mcpId} = any(${runnerFunctionApiKeys.allowedMcpIds})`,
              ),
            )
          const deleted = await transaction
            .delete(runnerMcps)
            .where(
              and(
                eq(runnerMcps.organizationId, organizationId),
                eq(runnerMcps.id, mcpId),
              ),
            )
            .returning({ id: runnerMcps.id })
          impact.localMcps += deleted.length
        }
      }

      const channelChatIds = transaction
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.channelId, channelId))
      const channelMessageIds = transaction
        .select({ id: messages.id })
        .from(messages)
        .where(inArray(messages.chatId, channelChatIds))
      await transaction
        .delete(messageStatusEvents)
        .where(inArray(messageStatusEvents.messageId, channelMessageIds))
      await transaction
        .delete(chatEvents)
        .where(inArray(chatEvents.chatId, channelChatIds))
      await transaction
        .update(chats)
        .set({ latestMessageId: null, latestReadMessageId: null })
        .where(eq(chats.channelId, channelId))
      await transaction
        .delete(messages)
        .where(inArray(messages.chatId, channelChatIds))
      await transaction.delete(chats).where(eq(chats.channelId, channelId))
      await transaction
        .delete(contacts)
        .where(eq(contacts.channelId, channelId))
      await transaction.delete(groups).where(eq(groups.channelId, channelId))
      await transaction
        .delete(webhooks)
        .where(eq(webhooks.channelId, channelId))
      const deletedBackups = await transaction
        .delete(agentBackups)
        .where(
          and(
            eq(agentBackups.organizationId, organizationId),
            eq(agentBackups.channelId, channelId),
          ),
        )
        .returning({ storagePath: agentBackups.storagePath })
      await transaction
        .delete(channels)
        .where(
          and(
            eq(channels.id, channelId),
            eq(channels.organizationId, organizationId),
          ),
        )
      return {
        status: 'deleted' as const,
        impact,
        backupStoragePaths: deletedBackups.map(
          ({ storagePath }) => storagePath,
        ),
      }
    }),
  getVerifyToken: async (organizationId, channelId) => {
    const [row] = await db
      .select({ token: channels.waWebhookVerifyToken })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row?.token
  },
  getWebhookConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        waAppId: channels.waAppId,
        waAppSecret: channels.waAppSecret,
        waWebhookVerifyToken: channels.waWebhookVerifyToken,
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
  getAgentConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        waPhoneNumberId: channels.waPhoneNumberId,
        waSystemUserAccessToken: channels.waSystemUserAccessToken,
        waWabaId: channels.waWabaId,
        waAppId: channels.waAppId,
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

export const createChannelOverviewRoute = ({
  applicationUrls = { workspace: 'http://localhost:3000' },
  deleteStoredFiles = async () => undefined,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
  getDashboardAnalytics = getMetaDashboardAnalytics,
}: ChannelOverviewRouteOptions = {}) =>
  new Hono()
    .get('/', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      return c.json({ channels: await repository.list(access.organizationId) })
    })
    .post('/', zValidator('json', createChannelSchema), async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        return c.json(
          {
            channel: await repository.create(
              access.organizationId,
              c.req.valid('json'),
            ),
          },
          201,
        )
      } catch (error) {
        if (getDatabaseErrorCode(error) === '23505') {
          return c.json(
            { message: 'A channel already uses this phone number ID' },
            409,
          )
        }
        throw error
      }
    })
    .get('/:id/registration', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
      )
      if ('response' in resolved) return resolved.response
      try {
        const phone = await registrationClient(
          resolved.configuration,
        ).getPhoneNumber({
          fields: ['status', 'display_phone_number', 'verified_name'],
        })
        return c.json({
          status:
            phone.status?.toUpperCase() === 'CONNECTED'
              ? ('registered' as const)
              : ('unregistered' as const),
          providerStatus: phone.status ?? null,
          displayPhoneNumber: phone.display_phone_number ?? null,
          verifiedName: phone.verified_name ?? null,
        })
      } catch (error) {
        return providerError(c, error, 'Could not load phone registration')
      }
    })
    .post(
      '/:id/registration/register',
      zValidator('json', registerPhoneNumberSchema),
      async (c) => {
        const resolved = await resolveManagedChannel(
          c.req.raw.headers,
          c.req.param('id'),
          getAccess,
          repository,
          true,
        )
        if ('response' in resolved) return resolved.response
        try {
          return c.json({
            result: await registrationClient(resolved.configuration).register({
              pin: c.req.valid('json').pin,
            }),
          })
        } catch (error) {
          return providerError(c, error, 'Could not register phone number')
        }
      },
    )
    .post('/:id/registration/deregister', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
        true,
      )
      if ('response' in resolved) return resolved.response
      try {
        return c.json({
          result: await registrationClient(resolved.configuration).deregister(),
        })
      } catch (error) {
        return providerError(c, error, 'Could not deregister phone number')
      }
    })
    .get('/:id/business-profile', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
      )
      if ('response' in resolved) return resolved.response
      try {
        return c.json({
          profile: await getBusinessProfile(resolved.configuration),
        })
      } catch (error) {
        return providerError(c, error, 'Could not load business profile')
      }
    })
    .put(
      '/:id/business-profile',
      zValidator('json', businessProfileSchema),
      async (c) => {
        const resolved = await resolveManagedChannel(
          c.req.raw.headers,
          c.req.param('id'),
          getAccess,
          repository,
          true,
        )
        if ('response' in resolved) return resolved.response
        try {
          await updateBusinessProfile(
            resolved.configuration,
            c.req.valid('json'),
          )
          return c.json({
            profile: await getBusinessProfile(resolved.configuration),
          })
        } catch (error) {
          return providerError(c, error, 'Could not update business profile')
        }
      },
    )
    .post('/:id/business-profile/picture', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
        true,
      )
      if ('response' in resolved) return resolved.response
      const form = await c.req.formData().catch(() => undefined)
      const picture = form?.get('picture')
      if (!(picture instanceof File)) {
        return c.json({ message: 'A profile picture is required' }, 400)
      }
      if (!['image/jpeg', 'image/png'].includes(picture.type)) {
        return c.json({ message: 'Profile picture must be JPEG or PNG' }, 400)
      }
      if (picture.size === 0 || picture.size > 5 * 1_024 * 1_024) {
        return c.json(
          { message: 'Profile picture must be 5 MB or smaller' },
          400,
        )
      }
      try {
        return c.json({
          handle: await uploadBusinessProfilePicture(
            resolved.configuration,
            picture,
          ),
        })
      } catch (error) {
        return providerError(
          c,
          error,
          'Could not upload business profile picture',
        )
      }
    })
    .get('/:id/qr-code', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
      )
      if ('response' in resolved) return resolved.response
      try {
        const qrCode = (
          await qrClient(resolved.configuration).list({
            fields: ['prefilled_message', 'deep_link_url'],
            imageFormat: 'SVG',
            limit: 1,
          })
        ).data[0]
        return c.json({
          qrCode: qrCode
            ? {
                code: qrCode.code,
                imageUrl: qrCode.qr_image_url
                  ? `/api/channels/${resolved.channelId}/qr-code/image`
                  : null,
                deepLinkUrl: qrCode.deep_link_url ?? null,
                prefilledMessage: qrCode.prefilled_message ?? null,
              }
            : null,
        })
      } catch (error) {
        return providerError(c, error, 'Could not load QR code')
      }
    })
    .get('/:id/qr-code/image', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
      )
      if ('response' in resolved) return resolved.response
      try {
        const qrCode = (
          await qrClient(resolved.configuration).list({
            fields: ['prefilled_message'],
            imageFormat: 'SVG',
            limit: 1,
          })
        ).data[0]
        if (!qrCode?.qr_image_url) {
          return c.json({ message: 'QR code image not found' }, 404)
        }
        const image = await downloadProviderImage(qrCode.qr_image_url)
        return c.body(image.body, 200, {
          'cache-control': 'private, max-age=300',
          'content-type': image.contentType,
          'x-content-type-options': 'nosniff',
        })
      } catch (error) {
        return providerError(c, error, 'Could not load QR code image')
      }
    })
    .post('/:id/qr-code', zValidator('json', qrCodeSchema), async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
        true,
      )
      if ('response' in resolved) return resolved.response
      try {
        return c.json(
          {
            qrCode: await qrClient(resolved.configuration).create({
              prefilled_message: c.req.valid('json').prefilledMessage,
              generate_qr_image: 'SVG',
            }),
          },
          201,
        )
      } catch (error) {
        return providerError(c, error, 'Could not create QR code')
      }
    })
    .patch(
      '/:id/qr-code/:code',
      zValidator('json', qrCodeSchema),
      async (c) => {
        const resolved = await resolveManagedChannel(
          c.req.raw.headers,
          c.req.param('id'),
          getAccess,
          repository,
          true,
        )
        if ('response' in resolved) return resolved.response
        try {
          return c.json({
            qrCode: await qrClient(resolved.configuration).update(
              c.req.param('code'),
              { prefilled_message: c.req.valid('json').prefilledMessage },
            ),
          })
        } catch (error) {
          return providerError(c, error, 'Could not update QR code')
        }
      },
    )
    .delete('/:id/qr-code/:code', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
        true,
      )
      if ('response' in resolved) return resolved.response
      try {
        return c.json({
          result: await qrClient(resolved.configuration).delete(
            c.req.param('code'),
          ),
        })
      } catch (error) {
        return providerError(c, error, 'Could not delete QR code')
      }
    })
    .get('/:id/components', async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
      )
      if ('response' in resolved) return resolved.response
      try {
        return c.json({
          components: await componentsClient(
            resolved.configuration,
          ).getConfiguration(),
        })
      } catch (error) {
        return providerError(
          c,
          error,
          'Could not load conversational components',
        )
      }
    })
    .put('/:id/components', zValidator('json', componentsSchema), async (c) => {
      const resolved = await resolveManagedChannel(
        c.req.raw.headers,
        c.req.param('id'),
        getAccess,
        repository,
        true,
      )
      if ('response' in resolved) return resolved.response
      try {
        const components = c.req.valid('json')
        await componentsClient(resolved.configuration).setConfiguration(
          components,
        )
        return c.json({ components })
      } catch (error) {
        return providerError(
          c,
          error,
          'Could not update conversational components',
        )
      }
    })
    .get('/:id/verify-token', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const token = await repository.getVerifyToken(
        access.organizationId,
        channelId,
      )
      return token
        ? c.json({ token })
        : c.json({ message: 'Channel not found' }, 404)
    })
    .post('/:id/set-webhook', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getWebhookConfiguration(
        access.organizationId,
        channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      const callbackUrl = `${applicationUrls.workspace}/api/wa-cloud/webhook/${channelId}`
      try {
        await createWhatsAppWebhookRegistrationClient({
          appId: configuration.waAppId,
          appSecret: configuration.waAppSecret,
        }).register({
          callbackUrl,
          verifyToken: configuration.waWebhookVerifyToken,
          fields: MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
        })
        return c.json({ success: true as const, callbackUrl })
      } catch (error) {
        return providerError(c, error, 'Could not register webhook')
      }
    })
    .get(
      '/:id/dashboard',
      zValidator(
        'query',
        z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }),
        (result, c) =>
          result.success
            ? undefined
            : c.json({ message: 'Invalid dashboard query' }, 400),
      ),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const configuration = await repository.getAgentConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)
        return c.json(
          await getDashboardAnalytics(configuration, c.req.valid('query').days),
        )
      },
    )
    .get('/:id/deletion-impact', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const impact = await repository.getDeletionPreview(
        access.organizationId,
        channelId,
      )
      return impact
        ? c.json({ impact })
        : c.json({ message: 'Channel not found' }, 404)
    })
    .patch('/:id', zValidator('json', updateChannelSchema), async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        const channel = await repository.update(
          access.organizationId,
          channelId,
          c.req.valid('json'),
        )
        return channel
          ? c.json({ channel })
          : c.json({ message: 'Channel not found' }, 404)
      } catch (error) {
        if (getDatabaseErrorCode(error) === '23505') {
          return c.json(
            { message: 'A channel already uses this phone number ID' },
            409,
          )
        }
        throw error
      }
    })
    .delete(
      '/:id',
      zValidator('json', deleteChannelSchema, (result, c) =>
        result.success
          ? undefined
          : c.json({ message: 'Invalid channel deletion request' }, 400),
      ),
      async (c) => {
        const channelId = parseChannelId(c.req.param('id'))
        if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageChannels(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        const result = await repository.delete(
          access.organizationId,
          channelId,
          c.req.valid('json').confirmation,
        )
        if (result.status === 'not_found') {
          return c.json({ message: 'Channel not found' }, 404)
        }
        if (result.status === 'confirmation_mismatch') {
          return c.json({ message: 'Channel confirmation did not match' }, 400)
        }
        await deleteStoredFiles(result.backupStoragePaths ?? []).catch(
          (error: unknown) => {
            console.error('Could not delete channel backup files', {
              organizationId: access.organizationId,
              channelId,
              error,
            })
          },
        )
        return c.json({
          deleted: true as const,
          channelId,
          impact: result.impact,
        })
      },
    )

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

function parseChannelId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) ? channelId : undefined
}

function canManageChannels(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

async function resolveManagedChannel(
  headers: Headers,
  rawChannelId: string,
  getAccess: NonNullable<ChannelOverviewRouteOptions['getAccess']>,
  repository: ChannelOverviewRepository,
  requireManager = false,
): Promise<
  | {
      channelId: number
      configuration: ChannelAgentConfiguration
    }
  | { response: Response }
> {
  const channelId = parseChannelId(rawChannelId)
  if (!channelId) return { response: jsonError('Invalid channel ID', 400) }
  const access = await getAccess(headers)
  if (!access) return { response: jsonError('Unauthorized', 401) }
  if (requireManager && !canManageChannels(access.role)) {
    return {
      response: jsonError('Organization owner or admin required', 403),
    }
  }
  const configuration = await repository.getAgentConfiguration(
    access.organizationId,
    channelId,
  )
  return configuration
    ? { channelId, configuration }
    : { response: jsonError('Channel not found', 404) }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function providerError(
  context: { json: (body: { message: string }, status: 502) => Response },
  error: unknown,
  fallback: string,
): Response {
  const message =
    error instanceof Error && error.message ? error.message : fallback
  return context.json({ message }, 502)
}

function registrationClient(configuration: ChannelAgentConfiguration) {
  return createWhatsAppRegistrationClient({
    accessToken: configuration.waSystemUserAccessToken,
    phoneNumberId: configuration.waPhoneNumberId,
  })
}

function qrClient(configuration: ChannelAgentConfiguration) {
  return createWhatsAppQrClient({
    accessToken: configuration.waSystemUserAccessToken,
    phoneNumberId: configuration.waPhoneNumberId,
  })
}

function componentsClient(configuration: ChannelAgentConfiguration) {
  return createWhatsAppComponentsClient({
    accessToken: configuration.waSystemUserAccessToken,
    phoneNumberId: configuration.waPhoneNumberId,
  })
}

const graphApiRoot = 'https://graph.facebook.com/v26.0'
const businessProfileFields =
  'about,address,description,email,profile_picture_url,vertical,websites'

async function getBusinessProfile(configuration: ChannelAgentConfiguration) {
  const profileUrl = new URL(
    `${graphApiRoot}/${encodeURIComponent(configuration.waPhoneNumberId)}/whatsapp_business_profile`,
  )
  profileUrl.searchParams.set('fields', businessProfileFields)
  const phoneUrl = new URL(
    `${graphApiRoot}/${encodeURIComponent(configuration.waPhoneNumberId)}`,
  )
  phoneUrl.searchParams.set('fields', 'verified_name')
  const [profileBody, phoneBody] = await Promise.all([
    requestGraph(profileUrl, configuration),
    requestGraph(phoneUrl, configuration),
  ])
  const profile =
    isRecord(profileBody) && Array.isArray(profileBody.data)
      ? profileBody.data[0]
      : undefined
  if (!isRecord(profile))
    throw new Error('Meta returned an invalid business profile')
  return {
    displayName:
      isRecord(phoneBody) && typeof phoneBody.verified_name === 'string'
        ? phoneBody.verified_name
        : '',
    about: stringValue(profile.about),
    address: stringValue(profile.address),
    description: stringValue(profile.description),
    email: stringValue(profile.email),
    vertical: businessProfileSchema.shape.vertical.safeParse(profile.vertical)
      .success
      ? businessProfileSchema.shape.vertical.parse(profile.vertical)
      : ('UNDEFINED' as const),
    websites: Array.isArray(profile.websites)
      ? profile.websites.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    profilePictureUrl:
      typeof profile.profile_picture_url === 'string'
        ? profile.profile_picture_url
        : null,
  }
}

async function updateBusinessProfile(
  configuration: ChannelAgentConfiguration,
  input: z.infer<typeof businessProfileSchema>,
): Promise<void> {
  const { displayName, profilePictureHandle, ...profile } = input
  const body = await requestGraph(
    new URL(
      `${graphApiRoot}/${encodeURIComponent(configuration.waPhoneNumberId)}/whatsapp_business_profile`,
    ),
    configuration,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...profile,
        ...(profilePictureHandle
          ? { profile_picture_handle: profilePictureHandle }
          : {}),
      }),
    },
  )
  if (!isRecord(body) || body.success !== true) {
    throw new Error('Meta returned an invalid business profile update')
  }
  const current = await getBusinessProfile(configuration)
  if (current.displayName === displayName) return
  const displayNameBody = await requestGraph(
    new URL(
      `${graphApiRoot}/${encodeURIComponent(configuration.waPhoneNumberId)}`,
    ),
    configuration,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        new_display_name: displayName,
      }),
    },
  )
  if (!isRecord(displayNameBody) || displayNameBody.success !== true) {
    throw new Error('Meta returned an invalid display-name update')
  }
}

async function uploadBusinessProfilePicture(
  configuration: ChannelAgentConfiguration,
  picture: File,
): Promise<string> {
  if (!configuration.waAppId) throw new Error('The channel has no Meta app ID')
  const sessionUrl = new URL(
    `${graphApiRoot}/${encodeURIComponent(configuration.waAppId)}/uploads`,
  )
  sessionUrl.searchParams.set('file_length', String(picture.size))
  sessionUrl.searchParams.set('file_type', picture.type)
  const session = await requestGraph(sessionUrl, configuration, {
    method: 'POST',
  })
  if (!isRecord(session) || typeof session.id !== 'string') {
    throw new Error('Meta returned an invalid upload session')
  }
  const upload = await requestGraph(
    new URL(`${graphApiRoot}/${encodeURIComponent(session.id)}`),
    configuration,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        file_offset: '0',
      },
      body: await picture.arrayBuffer(),
    },
  )
  if (!isRecord(upload) || typeof upload.h !== 'string') {
    throw new Error('Meta returned an invalid profile picture handle')
  }
  return upload.h
}

async function requestGraph(
  url: URL,
  configuration: ChannelAgentConfiguration,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `OAuth ${configuration.waSystemUserAccessToken}`,
      ...init.headers,
    },
  })
  const body = (await response.json().catch(() => undefined)) as unknown
  if (!response.ok) {
    const message =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === 'string'
        ? body.error.message
        : `Meta returned HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

async function downloadProviderImage(imageUrl: string): Promise<{
  body: ArrayBuffer
  contentType: 'image/png' | 'image/svg+xml'
}> {
  const url = new URL(imageUrl)
  if (url.protocol !== 'https:') throw new Error('QR image must use HTTPS')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`QR image returned HTTP ${response.status}`)
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]
  if (contentType !== 'image/png' && contentType !== 'image/svg+xml') {
    throw new Error('QR image has an unsupported content type')
  }
  const body = await response.arrayBuffer()
  if (body.byteLength > 2 * 1_024 * 1_024) {
    throw new Error('QR image exceeds the size limit')
  }
  return { body, contentType }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function getDeletionImpact(
  database: Pick<typeof db, 'select'>,
  organizationId: string,
  channelId: number,
): Promise<ChannelDeletionImpact> {
  const [contactTotal] = await database
    .select({ value: count() })
    .from(contacts)
    .where(eq(contacts.channelId, channelId))
  const [groupTotal] = await database
    .select({ value: count() })
    .from(groups)
    .where(eq(groups.channelId, channelId))
  const [messageTotal] = await database
    .select({ value: count() })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(eq(chats.channelId, channelId))
  const associations = await database
    .select({ mcpId: runnerAgentMcpConnectors.mcpId })
    .from(runnerAgentMcpConnectors)
    .where(
      and(
        eq(runnerAgentMcpConnectors.organizationId, organizationId),
        eq(runnerAgentMcpConnectors.channelId, channelId),
      ),
    )
  const mcpIds = [...new Set(associations.map(({ mcpId }) => mcpId))]
  const allAssociations = mcpIds.length
    ? await database
        .select({
          channelId: runnerAgentMcpConnectors.channelId,
          mcpId: runnerAgentMcpConnectors.mcpId,
        })
        .from(runnerAgentMcpConnectors)
        .where(
          and(
            eq(runnerAgentMcpConnectors.organizationId, organizationId),
            inArray(runnerAgentMcpConnectors.mcpId, mcpIds),
          ),
        )
    : []
  return {
    contacts: contactTotal?.value ?? 0,
    groups: groupTotal?.value ?? 0,
    messages: messageTotal?.value ?? 0,
    localMcpAssociations: associations.length,
    localMcps: mcpIds.filter((mcpId) =>
      allAssociations.every(
        (association) =>
          association.mcpId !== mcpId || association.channelId === channelId,
      ),
    ).length,
  }
}

function toChannelSummary(row: {
  id: number
  type: 'whatsapp'
  name: string
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  webhookForwardUrls: string[]
  hasWaAppSecret: boolean
  hasWaWebhookVerifyToken: boolean
  hasWaSystemUserAccessToken: boolean
  createdAt: Date
  updatedAt: Date
}): ChannelSummary {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getMetaDashboardAnalytics(
  configuration: ChannelAgentConfiguration,
  days: number,
  request: typeof fetch = fetch,
): Promise<ChannelDashboardAnalytics> {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  const dateRange = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
  const analytics = configuration.waWabaId
    ? createWhatsAppAnalyticsClient({
        accessToken: configuration.waSystemUserAccessToken,
        wabaId: configuration.waWabaId,
        fetch: request,
      })
    : null
  const mba = createWhatsAppMbaClient({
    accessToken: configuration.waSystemUserAccessToken,
    phoneNumberId: configuration.waPhoneNumberId,
    fetch: request,
  })
  const [messagingResult, conversationsResult, toolsResult] =
    await Promise.allSettled([
      analytics
        ? analytics.getMessagingAnalytics({
            start: Math.floor(start.getTime() / 1_000),
            end: Math.floor(end.getTime() / 1_000),
            granularity: 'DAY',
            phoneNumbers: [configuration.waPhoneNumberId],
          })
        : Promise.reject(new Error('WABA ID is unavailable')),
      mba.getConversationInsights({
        ...dateRange,
        metrics: ['ai_threads', 'ai_handoffs'],
      }),
      mba.getToolCallInsights(dateRange),
    ])
  const messaging =
    messagingResult.status === 'fulfilled'
      ? (() => {
          const series = messagingResult.value.analytics.data_points.map(
            (point) => ({
              date: new Date(point.start * 1_000).toISOString().slice(0, 10),
              sent: point.sent,
              delivered: point.delivered,
            }),
          )
          const sent = series.reduce((total, point) => total + point.sent, 0)
          const delivered = series.reduce(
            (total, point) => total + point.delivered,
            0,
          )
          return {
            sent,
            delivered,
            deliveryRate: sent > 0 ? delivered / sent : null,
            series,
          }
        })()
      : null
  const agentAvailable =
    conversationsResult.status === 'fulfilled' ||
    toolsResult.status === 'fulfilled'
  let threads = 0
  let handoffs = 0
  if (conversationsResult.status === 'fulfilled') {
    for (const insight of conversationsResult.value.data) {
      threads += insight.ai_threads?.count ?? 0
      handoffs += insight.ai_handoffs?.count ?? 0
    }
  }
  const tools = toolsResult.status === 'fulfilled' ? toolsResult.value.data : []
  const toolCalls = tools.reduce((total, tool) => total + tool.thread_count, 0)
  const weightedMetric = (
    select: (tool: (typeof tools)[number]) => number | null | undefined,
  ) => {
    const measured = tools.filter((tool) => select(tool) != null)
    const weight = measured.reduce(
      (total, tool) => total + tool.thread_count,
      0,
    )
    return weight === 0
      ? null
      : measured.reduce(
          (total, tool) => total + (select(tool) ?? 0) * tool.thread_count,
          0,
        ) / weight
  }
  return {
    period: { start: start.toISOString(), end: end.toISOString(), days },
    messaging,
    agent: agentAvailable
      ? {
          threads,
          handoffs,
          handoffRate: threads > 0 ? handoffs / threads : null,
          toolCalls,
          toolSuccessRate: weightedMetric((tool) => tool.success_rate),
          averageToolLatencyMs: weightedMetric((tool) => tool.avg_latency_ms),
        }
      : null,
    unavailable: [
      ...(messagingResult.status === 'rejected'
        ? (['messaging'] as const)
        : []),
      ...(!agentAvailable ? (['agent'] as const) : []),
    ],
  }
}
