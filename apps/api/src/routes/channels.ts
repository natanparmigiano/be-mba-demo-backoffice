import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const requiredText = z.string().trim().min(1).max(500)
const secretText = z.string().trim().min(1).max(10_000)

const createChannelSchema = z.object({
  waPhoneNumber: requiredText,
  waPhoneNumberId: requiredText,
  waWabaId: requiredText,
  waBusinessId: requiredText,
  waAppId: requiredText,
  waAppSecret: secretText,
  waWebhookVerifyToken: secretText,
  waSystemUserAccessToken: secretText,
})

const updateChannelSchema = createChannelSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one channel field is required',
  })

const setWebhookSchema = z.object({
  callbackUrl: z.string().url(),
})

type CreateChannelInput = z.infer<typeof createChannelSchema>
type UpdateChannelInput = z.infer<typeof updateChannelSchema>

export interface ChannelSummary {
  id: number
  type: 'whatsapp'
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
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

export interface ChannelWebhookConfiguration {
  waWabaId: string
  waWebhookVerifyToken: string
  waSystemUserAccessToken: string
}

export interface ChannelManagementRepository {
  list: (organizationId: string) => Promise<ChannelSummary[]>
  getVerifyToken: (
    organizationId: string,
    channelId: number,
  ) => Promise<string | undefined>
  getWebhookConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<ChannelWebhookConfiguration | undefined>
  create: (
    organizationId: string,
    input: CreateChannelInput,
  ) => Promise<ChannelSummary>
  update: (
    organizationId: string,
    channelId: number,
    input: UpdateChannelInput,
  ) => Promise<ChannelSummary | undefined>
  delete: (organizationId: string, channelId: number) => Promise<boolean>
}

export interface ChannelManagementRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ChannelManagementRepository
  setWebhookOverride?: (
    configuration: ChannelWebhookConfiguration,
    callbackUrl: string,
  ) => Promise<void>
}

const safeChannelSelection = {
  id: channels.id,
  type: channels.type,
  waPhoneNumber: channels.waPhoneNumber,
  waPhoneNumberId: channels.waPhoneNumberId,
  waWabaId: channels.waWabaId,
  waBusinessId: channels.waBusinessId,
  waAppId: channels.waAppId,
  hasWaAppSecret: sql<boolean>`${channels.waAppSecret} <> ''`,
  hasWaWebhookVerifyToken: sql<boolean>`${channels.waWebhookVerifyToken} <> ''`,
  hasWaSystemUserAccessToken: sql<boolean>`${channels.waSystemUserAccessToken} <> ''`,
  createdAt: channels.createdAt,
  updatedAt: channels.updatedAt,
}

const databaseRepository: ChannelManagementRepository = {
  list: async (organizationId) => {
    const rows = await db
      .select(safeChannelSelection)
      .from(channels)
      .where(eq(channels.organizationId, organizationId))
      .orderBy(channels.createdAt)
    return rows.map(toChannelSummary)
  },
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
        waWabaId: channels.waWabaId,
        waWebhookVerifyToken: channels.waWebhookVerifyToken,
        waSystemUserAccessToken: channels.waSystemUserAccessToken,
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
  create: async (organizationId, input) => {
    const [row] = await db
      .insert(channels)
      .values({
        ...input,
        organizationId,
        type: 'whatsapp',
      })
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
  delete: async (organizationId, channelId) => {
    const deleted = await db
      .delete(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .returning({ id: channels.id })
    return deleted.length > 0
  },
}

export const createChannelManagementRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
  setWebhookOverride = overrideMetaWebhook,
}: ChannelManagementRouteOptions = {}) =>
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
        const channel = await repository.create(
          access.organizationId,
          c.req.valid('json'),
        )
        return c.json({ channel }, 201)
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
      if (!token) return c.json({ message: 'Channel not found' }, 404)
      return c.json({ token })
    })
    .post(
      '/:id/set-webhook',
      zValidator('json', setWebhookSchema),
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

        const { callbackUrl } = c.req.valid('json')
        const callback = new URL(callbackUrl)
        if (
          callback.username ||
          callback.password ||
          callback.search ||
          callback.hash ||
          callback.pathname !== `/api/wa-cloud/webhook/${channelId}`
        ) {
          return c.json({ message: 'Invalid channel webhook URL' }, 400)
        }

        const configuration = await repository.getWebhookConfiguration(
          access.organizationId,
          channelId,
        )
        if (!configuration) {
          return c.json({ message: 'Channel not found' }, 404)
        }

        try {
          await setWebhookOverride(configuration, callbackUrl)
          return c.json({
            success: true as const,
            message: 'Meta webhook override updated successfully',
            callbackUrl,
          })
        } catch (error) {
          if (error instanceof MetaWebhookOverrideError) {
            return c.json({ message: error.message }, 422)
          }
          throw error
        }
      },
    )
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
        if (!channel) return c.json({ message: 'Channel not found' }, 404)
        return c.json({ channel })
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
    .delete('/:id', async (c) => {
      const channelId = parseChannelId(c.req.param('id'))
      if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageChannels(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }

      try {
        if (!(await repository.delete(access.organizationId, channelId))) {
          return c.json({ message: 'Channel not found' }, 404)
        }
        return c.json({ deleted: true as const, channelId })
      } catch (error) {
        if (getDatabaseErrorCode(error) === '23503') {
          return c.json(
            {
              message:
                'This channel contains persisted data and cannot be deleted',
            },
            409,
          )
        }
        throw error
      }
    })

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

function canManageChannels(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function parseChannelId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) ? channelId : undefined
}

function toChannelSummary(row: {
  id: number
  type: 'whatsapp'
  waPhoneNumber: string
  waPhoneNumberId: string
  waWabaId: string
  waBusinessId: string
  waAppId: string
  hasWaAppSecret: boolean
  hasWaWebhookVerifyToken: boolean
  hasWaSystemUserAccessToken: boolean
  createdAt: Date
  updatedAt: Date
}): ChannelSummary {
  return {
    id: row.id,
    type: row.type,
    waPhoneNumber: row.waPhoneNumber,
    waPhoneNumberId: row.waPhoneNumberId,
    waWabaId: row.waWabaId,
    waBusinessId: row.waBusinessId,
    waAppId: row.waAppId,
    hasWaAppSecret: row.hasWaAppSecret,
    hasWaWebhookVerifyToken: row.hasWaWebhookVerifyToken,
    hasWaSystemUserAccessToken: row.hasWaSystemUserAccessToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('code' in error && typeof error.code === 'string') return error.code
  if ('cause' in error) return getDatabaseErrorCode(error.cause)
  return undefined
}

const META_GRAPH_API_BASE_URL = 'https://graph.facebook.com/v26.0'

export async function overrideMetaWebhook(
  configuration: ChannelWebhookConfiguration,
  callbackUrl: string,
  request: typeof fetch = fetch,
): Promise<void> {
  let response: Response
  try {
    response = await request(
      `${META_GRAPH_API_BASE_URL}/${encodeURIComponent(configuration.waWabaId)}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.waSystemUserAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          override_callback_uri: callbackUrl,
          verify_token: configuration.waWebhookVerifyToken,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
  } catch {
    throw new MetaWebhookOverrideError('Could not reach the Meta Graph API')
  }

  if (response.ok) return

  const body: unknown = await response.json().catch(() => undefined)
  const detail =
    isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.message === 'string'
      ? body.error.message
      : `Meta Graph API request failed (${response.status})`
  throw new MetaWebhookOverrideError(`Meta rejected the webhook: ${detail}`)
}

class MetaWebhookOverrideError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
