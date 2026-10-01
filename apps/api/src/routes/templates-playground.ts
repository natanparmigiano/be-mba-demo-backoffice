import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppTemplatesClient,
  WhatsAppTemplatesApiError,
  WhatsAppTemplatesResponseError,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type WhatsAppTemplatesClientContract,
} from '@mba-demo/wa-templates'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})
const templateParamSchema = channelParamSchema.extend({
  templateId: z.string().trim().min(1).max(256),
})
const fieldsSchema = z
  .string()
  .trim()
  .max(2_000)
  .refine(
    (value) =>
      value.length === 0 ||
      value
        .split(',')
        .every((field) => /^[A-Za-z][A-Za-z0-9_]*$/.test(field.trim())),
    { message: 'Fields must be comma-separated Graph API field names' },
  )
  .optional()
const listSchema = z.object({
  name: z.string().trim().max(512).optional(),
  language: z.string().trim().max(35).optional(),
  category: z
    .enum(['AUTHENTICATION', 'FREE_SERVICE', 'MARKETING', 'UTILITY'])
    .optional(),
  status: z
    .enum([
      'APPROVED',
      'ARCHIVED',
      'DELETED',
      'DISABLED',
      'IN_APPEAL',
      'LIMIT_EXCEEDED',
      'PAUSED',
      'PENDING',
      'PENDING_DELETION',
      'REJECTED',
    ])
    .optional(),
  fields: fieldsSchema,
  limit: z.coerce.number().int().positive().max(1_000).optional(),
  before: z.string().trim().min(1).max(2_000).optional(),
  after: z.string().trim().min(1).max(2_000).optional(),
})
const getSchema = z.object({ fields: fieldsSchema })
const templateBodySchema = z.object({
  input: z.record(z.string(), z.unknown()),
})
const deleteSchema = z.object({ name: z.string().trim().min(1).max(512) })

interface OrganizationAccess {
  organizationId: string
  role: string
}
export interface TemplatesPlaygroundConfiguration {
  wabaId: string
  accessToken: string
}
export interface TemplatesPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<TemplatesPlaygroundConfiguration | undefined>
}
export interface TemplatesPlaygroundRouteOptions {
  createTemplatesClient?: (
    configuration: TemplatesPlaygroundConfiguration,
  ) => WhatsAppTemplatesClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: TemplatesPlaygroundRepository
}

const databaseRepository: TemplatesPlaygroundRepository = {
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

export const createTemplatesPlaygroundRoute = ({
  createTemplatesClient = defaultCreateTemplatesClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: TemplatesPlaygroundRouteOptions = {}) =>
  new Hono()
    .get(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('query', listSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          false,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        const query = c.req.valid('query')
        try {
          const result = await createTemplatesClient(
            context.configuration,
          ).list({
            ...query,
            fields: parseFields(query.fields),
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .post(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('json', templateBodySchema),
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
          const result = await createTemplatesClient(
            context.configuration,
          ).create(
            c.req.valid('json').input as unknown as CreateTemplateInput,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .get(
      '/:channelId/namespace',
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
          const result = await createTemplatesClient(
            context.configuration,
          ).getNamespace({ signal: AbortSignal.timeout(15_000) })
          return c.json({ result })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .get(
      '/:channelId/:templateId',
      zValidator('param', templateParamSchema),
      zValidator('query', getSchema),
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
          const result = await createTemplatesClient(context.configuration).get(
            c.req.valid('param').templateId,
            {
              fields: parseFields(c.req.valid('query').fields),
              signal: AbortSignal.timeout(15_000),
            },
          )
          return c.json({ result })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .post(
      '/:channelId/:templateId',
      zValidator('param', templateParamSchema),
      zValidator('json', templateBodySchema),
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
          const result = await createTemplatesClient(
            context.configuration,
          ).update(
            c.req.valid('param').templateId,
            c.req.valid('json').input as UpdateTemplateInput,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .delete(
      '/:channelId/:templateId',
      zValidator('param', templateParamSchema),
      zValidator('json', deleteSchema),
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
          const result = await createTemplatesClient(
            context.configuration,
          ).deleteById(
            c.req.valid('param').templateId,
            c.req.valid('json').name,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<TemplatesPlaygroundRouteOptions['getAccess']>,
  repository: TemplatesPlaygroundRepository,
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
function defaultCreateTemplatesClient(
  configuration: TemplatesPlaygroundConfiguration,
) {
  return createWhatsAppTemplatesClient({
    accessToken: configuration.accessToken,
    wabaId: configuration.wabaId,
  })
}
function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}
function parseFields(value: string | undefined) {
  return value
    ? [...new Set(value.split(',').map((field) => field.trim()))].filter(
        Boolean,
      )
    : []
}
function templatesError(c: Context, error: unknown) {
  if (error instanceof WhatsAppTemplatesApiError) {
    return c.json(
      {
        message: `Meta rejected the templates request: ${error.message}`,
        providerStatus: error.status,
      },
      502,
    )
  }
  if (error instanceof WhatsAppTemplatesResponseError)
    return c.json(
      { message: 'Meta returned an unexpected templates response' },
      502,
    )
  if (error instanceof TypeError || error instanceof RangeError)
    return c.json({ message: error.message }, 400)
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
