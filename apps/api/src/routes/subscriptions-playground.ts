import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppSubscriptionsClient,
  createWhatsAppWebhookRegistrationClient,
  MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
  WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
  WhatsAppSubscriptionsApiError,
  WhatsAppSubscriptionsResponseError,
  WhatsAppWebhookRegistrationApiError,
  WhatsAppWebhookRegistrationResponseError,
  type WhatsAppSubscriptionsClientContract,
  type WhatsAppWebhookRegistrationClientContract,
} from '@mba-demo/wa-subscriptions'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const overrideCallbackSchema = z.object({
  callbackUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    }, 'Callback URL must use HTTP or HTTPS'),
  verifyToken: z.string().trim().min(1).max(2_000),
})

const appRegistrationSchema = overrideCallbackSchema.extend({
  fields: z
    .array(z.enum(WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS))
    .min(1)
    .max(WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS.length),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface SubscriptionsPlaygroundConfiguration {
  appId: string
  appSecret: string
  wabaId: string
  accessToken: string
}

export interface SubscriptionsPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<SubscriptionsPlaygroundConfiguration | undefined>
}

export interface SubscriptionsPlaygroundRouteOptions {
  createSubscriptionsClient?: (
    configuration: SubscriptionsPlaygroundConfiguration,
  ) => WhatsAppSubscriptionsClientContract
  createRegistrationClient?: (
    configuration: SubscriptionsPlaygroundConfiguration,
  ) => WhatsAppWebhookRegistrationClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: SubscriptionsPlaygroundRepository
}

const databaseRepository: SubscriptionsPlaygroundRepository = {
  getConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        appId: channels.waAppId,
        appSecret: channels.waAppSecret,
        wabaId: channels.waWabaId,
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

export const createSubscriptionsPlaygroundRoute = ({
  createSubscriptionsClient = defaultCreateSubscriptionsClient,
  createRegistrationClient = defaultCreateRegistrationClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: SubscriptionsPlaygroundRouteOptions = {}) =>
  new Hono()
    .get('/fields', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      return c.json({
        fields: WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
        recommendedFields: MBA_WEBHOOK_SUBSCRIPTION_FIELDS,
      })
    })
    .get(
      '/:channelId/app-registration',
      zValidator('param', channelParamSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          false,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).list({ signal: AbortSignal.timeout(15_000) })
          return c.json({ result })
        } catch (error) {
          return subscriptionsError(c, error)
        }
      },
    )
    .post(
      '/:channelId/app-registration',
      zValidator('param', channelParamSchema),
      zValidator('json', appRegistrationSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          true,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        const input = c.req.valid('json')
        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).register(
            {
              callbackUrl: input.callbackUrl,
              verifyToken: input.verifyToken,
              fields: input.fields,
            },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return subscriptionsError(c, error)
        }
      },
    )
    .get('/:channelId', zValidator('param', channelParamSchema), async (c) => {
      const context = await getChannelContext(
        c.req.raw.headers,
        c.req.valid('param').channelId,
        false,
        getAccess,
        repository,
      )
      if (context.status !== 200) return contextError(c, context.status)
      try {
        const result = await createSubscriptionsClient(
          context.configuration,
        ).list({ signal: AbortSignal.timeout(15_000) })
        return c.json({ result })
      } catch (error) {
        return subscriptionsError(c, error)
      }
    })
    .post('/:channelId', zValidator('param', channelParamSchema), async (c) => {
      const context = await getChannelContext(
        c.req.raw.headers,
        c.req.valid('param').channelId,
        true,
        getAccess,
        repository,
      )
      if (context.status !== 200) return contextError(c, context.status)
      try {
        const result = await createSubscriptionsClient(
          context.configuration,
        ).subscribe({ signal: AbortSignal.timeout(15_000) })
        return c.json({ result })
      } catch (error) {
        return subscriptionsError(c, error)
      }
    })
    .post(
      '/:channelId/override-callback',
      zValidator('param', channelParamSchema),
      zValidator('json', overrideCallbackSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          true,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        const input = c.req.valid('json')
        try {
          const result = await createSubscriptionsClient(
            context.configuration,
          ).overrideCallback(
            {
              override_callback_uri: input.callbackUrl,
              verify_token: input.verifyToken,
            },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return subscriptionsError(c, error)
        }
      },
    )
    .delete(
      '/:channelId',
      zValidator('param', channelParamSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          true,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        try {
          const result = await createSubscriptionsClient(
            context.configuration,
          ).unsubscribe({ signal: AbortSignal.timeout(15_000) })
          return c.json({ result })
        } catch (error) {
          return subscriptionsError(c, error)
        }
      },
    )

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<SubscriptionsPlaygroundRouteOptions['getAccess']>,
  repository: SubscriptionsPlaygroundRepository,
) {
  const access = await getAccess(headers)
  if (!access) return { status: 401 as const }
  if (requiresManager && !canManage(access.role))
    return { status: 403 as const }
  const configuration = await repository.getConfiguration(
    access.organizationId,
    channelId,
  )
  return configuration
    ? { status: 200 as const, configuration }
    : { status: 404 as const }
}

function contextError(c: Context, status: 401 | 403 | 404) {
  if (status === 401) return c.json({ message: 'Unauthorized' }, 401)
  if (status === 403)
    return c.json({ message: 'Organization owner or admin required' }, 403)
  return c.json({ message: 'Channel not found' }, 404)
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

function defaultCreateSubscriptionsClient(
  configuration: SubscriptionsPlaygroundConfiguration,
) {
  return createWhatsAppSubscriptionsClient(configuration)
}

function defaultCreateRegistrationClient(
  configuration: SubscriptionsPlaygroundConfiguration,
) {
  return createWhatsAppWebhookRegistrationClient({
    appId: configuration.appId,
    appSecret: configuration.appSecret,
  })
}

function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function subscriptionsError(c: Context, error: unknown) {
  if (error instanceof WhatsAppWebhookRegistrationApiError) {
    return c.json(
      {
        message: `Meta rejected the webhook registration request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppWebhookRegistrationResponseError)
    return c.json(
      { message: 'Meta returned an unexpected webhook registration response' },
      502,
    )
  if (error instanceof WhatsAppSubscriptionsApiError) {
    return c.json(
      {
        message: `Meta rejected the subscriptions request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppSubscriptionsResponseError)
    return c.json(
      { message: 'Meta returned an unexpected subscriptions response' },
      502,
    )
  if (error instanceof TypeError || error instanceof RangeError)
    return c.json({ message: error.message }, 400)
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
