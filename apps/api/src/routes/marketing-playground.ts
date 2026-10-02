import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppMarketingClient,
  WhatsAppMarketingApiError,
  WhatsAppMarketingResponseError,
  type SendMarketingMessageInput,
  type WhatsAppMarketingClientContract,
} from '@mba-demo/wa-marketing'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const marketingMessageSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  recipient_type: z.literal('individual'),
  to: z.string().trim().min(1).max(64),
  type: z.literal('template'),
  template: z.object({
    name: z.string().trim().min(1).max(512),
    language: z.object({
      code: z.string().trim().min(1).max(32),
      policy: z.literal('deterministic').optional(),
    }),
    components: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  product_policy: z.enum(['CLOUD_API_FALLBACK', 'STRICT']).optional(),
  message_activity_sharing: z.boolean().optional(),
  bid_spec: z
    .object({ per_message_bid_multiplier: z.number().positive().finite() })
    .optional(),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface MarketingPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface MarketingPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<MarketingPlaygroundConfiguration | undefined>
}

export interface MarketingPlaygroundRouteOptions {
  createMarketingClient?: (
    configuration: MarketingPlaygroundConfiguration,
  ) => WhatsAppMarketingClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: MarketingPlaygroundRepository
}

const databaseRepository: MarketingPlaygroundRepository = {
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

export const createMarketingPlaygroundRoute = ({
  createMarketingClient = (configuration) =>
    createWhatsAppMarketingClient(configuration),
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: MarketingPlaygroundRouteOptions = {}) =>
  new Hono().post(
    '/:channelId/send',
    zValidator('param', channelParamSchema),
    zValidator('json', marketingMessageSchema),
    async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManage(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getConfiguration(
        access.organizationId,
        c.req.valid('param').channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)

      const { messaging_product, recipient_type, type, ...input } =
        c.req.valid('json')
      void messaging_product
      void recipient_type
      void type
      try {
        const result = await createMarketingClient(configuration).send(
          input as SendMarketingMessageInput,
          { signal: AbortSignal.timeout(15_000) },
        )
        return c.json({ result })
      } catch (error) {
        if (error instanceof WhatsAppMarketingApiError) {
          return c.json(
            {
              message: `Meta rejected the marketing message: ${error.message}`,
              providerStatus: error.status,
            },
            502,
          )
        }
        if (error instanceof WhatsAppMarketingResponseError) {
          return c.json(
            { message: `Meta returned an invalid response: ${error.message}` },
            502,
          )
        }
        if (error instanceof TypeError || error instanceof RangeError) {
          return c.json({ message: error.message }, 400)
        }
        throw error
      }
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

function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}
