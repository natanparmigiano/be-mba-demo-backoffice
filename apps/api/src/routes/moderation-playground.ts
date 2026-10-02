import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppModerationClient,
  WhatsAppModerationApiError,
  WhatsAppModerationResponseError,
  type WhatsAppModerationClientContract,
} from '@mba-demo/wa-moderation'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().safe().max(1_000).optional(),
  before: z.string().trim().min(1).max(2_000).optional(),
  after: z.string().trim().min(1).max(2_000).optional(),
})
const usersSchema = z.object({
  users: z.array(z.string().trim().min(1).max(64)).min(1).max(1_000),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface ModerationPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface ModerationPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<ModerationPlaygroundConfiguration | undefined>
}

export interface ModerationPlaygroundRouteOptions {
  createModerationClient?: (
    configuration: ModerationPlaygroundConfiguration,
  ) => WhatsAppModerationClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ModerationPlaygroundRepository
}

const databaseRepository: ModerationPlaygroundRepository = {
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

export const createModerationPlaygroundRoute = ({
  createModerationClient = defaultCreateModerationClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: ModerationPlaygroundRouteOptions = {}) =>
  new Hono()
    .get(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('query', listQuerySchema),
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
          const result = await createModerationClient(
            context.configuration,
          ).list({
            ...c.req.valid('query'),
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return moderationError(c, error)
        }
      },
    )
    .post(
      '/:channelId/block',
      zValidator('param', channelParamSchema),
      zValidator('json', usersSchema),
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
          const result = await createModerationClient(
            context.configuration,
          ).block(c.req.valid('json').users, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return moderationError(c, error)
        }
      },
    )
    .post(
      '/:channelId/unblock',
      zValidator('param', channelParamSchema),
      zValidator('json', usersSchema),
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
          const result = await createModerationClient(
            context.configuration,
          ).unblock(c.req.valid('json').users, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return moderationError(c, error)
        }
      },
    )

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<ModerationPlaygroundRouteOptions['getAccess']>,
  repository: ModerationPlaygroundRepository,
) {
  const access = await getAccess(headers)
  if (!access) return { status: 401 as const }
  if (requiresManager && !canManageChannels(access.role)) {
    return { status: 403 as const }
  }
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
  if (status === 403) {
    return c.json({ message: 'Organization owner or admin required' }, 403)
  }
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

function defaultCreateModerationClient(
  configuration: ModerationPlaygroundConfiguration,
): WhatsAppModerationClientContract {
  return createWhatsAppModerationClient(configuration)
}

function canManageChannels(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function moderationError(c: Context, error: unknown) {
  if (error instanceof WhatsAppModerationApiError) {
    return c.json(
      {
        message: `Meta rejected the moderation request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppModerationResponseError) {
    return c.json(
      { message: 'Meta returned an unexpected moderation response' },
      502,
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
