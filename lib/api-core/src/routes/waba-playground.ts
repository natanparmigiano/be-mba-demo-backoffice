import { auth } from '@mba-desk/auth'
import { channels, db, member } from '@mba-desk/db'
import {
  createWhatsAppWabaClient,
  WhatsAppWabaApiError,
  WhatsAppWabaResponseError,
  type WhatsAppWabaClientContract,
} from '@mba-desk/wa-waba'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})
const accountParamSchema = channelParamSchema.extend({
  wabaId: z.string().trim().min(1).max(256),
})
const businessParamSchema = channelParamSchema.extend({
  businessId: z.string().trim().min(1).max(256),
})
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().safe().max(1_000).optional(),
  before: z.string().trim().min(1).max(2_000).optional(),
  after: z.string().trim().min(1).max(2_000).optional(),
})

interface OrganizationAccess {
  organizationId: string
}

export interface WabaPlaygroundConfiguration {
  accessToken: string
}

export interface WabaPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<WabaPlaygroundConfiguration | undefined>
}

export interface WabaPlaygroundRouteOptions {
  createWabaClient?: (
    configuration: WabaPlaygroundConfiguration,
  ) => WhatsAppWabaClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: WabaPlaygroundRepository
}

const databaseRepository: WabaPlaygroundRepository = {
  getConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({ accessToken: channels.waSystemUserAccessToken })
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

export const createWabaPlaygroundRoute = ({
  createWabaClient = defaultCreateWabaClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: WabaPlaygroundRouteOptions = {}) =>
  new Hono()
    .get(
      '/:channelId/accounts/:wabaId',
      zValidator('param', accountParamSchema),
      async (c) => {
        const { channelId, wabaId } = c.req.valid('param')
        const context = await getChannelContext(
          c.req.raw.headers,
          channelId,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        try {
          const result = await createWabaClient(context.configuration).get(
            wabaId,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return wabaError(c, error)
        }
      },
    )
    .get(
      '/:channelId/businesses/:businessId/owned',
      zValidator('param', businessParamSchema),
      zValidator('query', listQuerySchema),
      async (c) =>
        listAccounts(
          c,
          'owned',
          c.req.valid('param'),
          c.req.valid('query'),
          createWabaClient,
          getAccess,
          repository,
        ),
    )
    .get(
      '/:channelId/businesses/:businessId/shared',
      zValidator('param', businessParamSchema),
      zValidator('query', listQuerySchema),
      async (c) =>
        listAccounts(
          c,
          'shared',
          c.req.valid('param'),
          c.req.valid('query'),
          createWabaClient,
          getAccess,
          repository,
        ),
    )

async function listAccounts(
  c: Context,
  kind: 'owned' | 'shared',
  param: z.infer<typeof businessParamSchema>,
  query: z.infer<typeof listQuerySchema>,
  createClient: NonNullable<WabaPlaygroundRouteOptions['createWabaClient']>,
  getAccess: NonNullable<WabaPlaygroundRouteOptions['getAccess']>,
  repository: WabaPlaygroundRepository,
) {
  const { channelId, businessId } = param
  const context = await getChannelContext(
    c.req.raw.headers,
    channelId,
    getAccess,
    repository,
  )
  if (context.status !== 200) return contextError(c, context.status)
  try {
    const options = {
      ...query,
      signal: AbortSignal.timeout(15_000),
    }
    const client = createClient(context.configuration)
    const result =
      kind === 'owned'
        ? await client.listOwned(businessId, options)
        : await client.listShared(businessId, options)
    return c.json({ result })
  } catch (error) {
    return wabaError(c, error)
  }
}

async function getChannelContext(
  headers: Headers,
  channelId: number,
  getAccess: NonNullable<WabaPlaygroundRouteOptions['getAccess']>,
  repository: WabaPlaygroundRepository,
) {
  const access = await getAccess(headers)
  if (!access) return { status: 401 as const }
  const configuration = await repository.getConfiguration(
    access.organizationId,
    channelId,
  )
  return configuration
    ? { status: 200 as const, configuration }
    : { status: 404 as const }
}

function contextError(c: Context, status: 401 | 404) {
  return status === 401
    ? c.json({ message: 'Unauthorized' }, 401)
    : c.json({ message: 'Channel not found' }, 404)
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

function defaultCreateWabaClient(configuration: WabaPlaygroundConfiguration) {
  return createWhatsAppWabaClient(configuration)
}

function wabaError(c: Context, error: unknown) {
  if (error instanceof WhatsAppWabaApiError) {
    return c.json(
      {
        message: `Meta rejected the WABA request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppWabaResponseError) {
    return c.json({ message: 'Meta returned an unexpected WABA response' }, 502)
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
