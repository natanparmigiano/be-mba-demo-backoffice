import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppAnalyticsClient,
  WhatsAppAnalyticsApiError,
  WhatsAppAnalyticsResponseError,
  type CallAnalyticsOptions,
  type ConversationAnalyticsOptions,
  type GroupAnalyticsOptions,
  type MessagingAnalyticsOptions,
  type PricingAnalyticsOptions,
  type TemplateAnalyticsOptions,
  type TemplateGroupAnalyticsOptions,
  type WhatsAppAnalyticsClientContract,
} from '@mba-demo/wa-analytics'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})
const requestSchema = z.object({
  action: z.enum([
    'messaging',
    'conversation',
    'pricing',
    'template',
    'templateGroup',
    'call',
    'group',
    'enableTemplate',
  ]),
  input: z.record(z.string(), z.unknown()),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}
export interface AnalyticsPlaygroundConfiguration {
  wabaId: string
  accessToken: string
}
export interface AnalyticsPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<AnalyticsPlaygroundConfiguration | undefined>
}
export interface AnalyticsPlaygroundRouteOptions {
  createAnalyticsClient?: (
    configuration: AnalyticsPlaygroundConfiguration,
  ) => WhatsAppAnalyticsClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: AnalyticsPlaygroundRepository
}

const databaseRepository: AnalyticsPlaygroundRepository = {
  getConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
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

export const createAnalyticsPlaygroundRoute = ({
  createAnalyticsClient = defaultCreateAnalyticsClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: AnalyticsPlaygroundRouteOptions = {}) =>
  new Hono().post(
    '/:channelId',
    zValidator('param', channelParamSchema),
    zValidator('json', requestSchema),
    async (c) => {
      const request = c.req.valid('json')
      const context = await getChannelContext(
        c.req.raw.headers,
        c.req.valid('param').channelId,
        request.action === 'enableTemplate',
        getAccess,
        repository,
      )
      if (context.status !== 200) return contextError(c, context.status)

      const client = createAnalyticsClient(context.configuration)
      const signal = AbortSignal.timeout(15_000)
      try {
        const result = await runOperation(client, request, signal)
        return c.json({ result })
      } catch (error) {
        return analyticsError(c, error)
      }
    },
  )

async function runOperation(
  client: WhatsAppAnalyticsClientContract,
  request: z.infer<typeof requestSchema>,
  signal: AbortSignal,
) {
  switch (request.action) {
    case 'messaging':
      return client.getMessagingAnalytics({
        ...(request.input as unknown as MessagingAnalyticsOptions),
        signal,
      })
    case 'conversation':
      return client.getConversationAnalytics({
        ...(request.input as unknown as ConversationAnalyticsOptions),
        signal,
      })
    case 'pricing':
      return client.getPricingAnalytics({
        ...(request.input as unknown as PricingAnalyticsOptions),
        signal,
      })
    case 'template':
      return client.getTemplateAnalytics({
        ...(request.input as unknown as TemplateAnalyticsOptions),
        signal,
      })
    case 'templateGroup':
      return client.getTemplateGroupAnalytics({
        ...(request.input as unknown as TemplateGroupAnalyticsOptions),
        signal,
      })
    case 'call':
      return client.getCallAnalytics({
        ...(request.input as unknown as CallAnalyticsOptions),
        signal,
      })
    case 'group':
      return client.getGroupAnalytics({
        ...(request.input as unknown as GroupAnalyticsOptions),
        signal,
      })
    case 'enableTemplate':
      return client.enableTemplateAnalytics({ signal })
  }
}

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<AnalyticsPlaygroundRouteOptions['getAccess']>,
  repository: AnalyticsPlaygroundRepository,
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
function defaultCreateAnalyticsClient(
  configuration: AnalyticsPlaygroundConfiguration,
) {
  return createWhatsAppAnalyticsClient(configuration)
}
function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}
function analyticsError(c: Context, error: unknown) {
  if (error instanceof WhatsAppAnalyticsApiError) {
    return c.json(
      {
        message: `Meta rejected the analytics request: ${error.message}`,
        providerStatus: error.status,
      },
      502,
    )
  }
  if (error instanceof WhatsAppAnalyticsResponseError)
    return c.json(
      { message: 'Meta returned an unexpected analytics response' },
      502,
    )
  if (error instanceof TypeError || error instanceof RangeError)
    return c.json({ message: error.message }, 400)
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
