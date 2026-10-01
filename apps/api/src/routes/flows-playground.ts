import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppFlowsClient,
  WhatsAppFlowsApiError,
  WhatsAppFlowsResponseError,
  type CreateFlowInput,
  type GetFlowMetricOptions,
  type ListFlowsOptions,
  type MigrateFlowsInput,
  type SetEncryptionPublicKeyInput,
  type UpdateFlowMetadataInput,
  type WhatsAppFlowsClientContract,
} from '@mba-demo/wa-flows'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})
const actions = [
  'create',
  'list',
  'get',
  'preview',
  'migrate',
  'updateMetadata',
  'uploadJson',
  'listAssets',
  'publish',
  'deprecate',
  'delete',
  'metric',
  'getEncryptionKey',
  'setEncryptionKey',
] as const
const requestSchema = z.object({
  action: z.enum(actions),
  flowId: z.string().trim().min(1).max(256).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
})

interface Access {
  organizationId: string
  role: string
}
export interface FlowsPlaygroundConfiguration {
  wabaId: string
  phoneNumberId: string
  accessToken: string
}
export interface FlowsPlaygroundRepository {
  getConfiguration(
    organizationId: string,
    channelId: number,
  ): Promise<FlowsPlaygroundConfiguration | undefined>
}
export interface FlowsPlaygroundRouteOptions {
  createFlowsClient?: (
    configuration: FlowsPlaygroundConfiguration,
  ) => WhatsAppFlowsClientContract
  getAccess?: (headers: Headers) => Promise<Access | undefined>
  repository?: FlowsPlaygroundRepository
}

const databaseRepository: FlowsPlaygroundRepository = {
  getConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        wabaId: channels.waWabaId,
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

export const createFlowsPlaygroundRoute = ({
  createFlowsClient = (configuration) =>
    createWhatsAppFlowsClient(configuration),
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: FlowsPlaygroundRouteOptions = {}) =>
  new Hono().post(
    '/:channelId',
    zValidator('param', channelSchema),
    zValidator('json', requestSchema),
    async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const request = c.req.valid('json')
      if (!isReadAction(request.action) && !canManage(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const configuration = await repository.getConfiguration(
        access.organizationId,
        c.req.valid('param').channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      try {
        const client = createFlowsClient(configuration)
        const result = await execute(
          client,
          configuration.phoneNumberId,
          request,
        )
        return c.json({ result })
      } catch (error) {
        return flowsError(c, error)
      }
    },
  )

type RequestData = z.infer<typeof requestSchema>
const timeout = () => ({ signal: AbortSignal.timeout(30_000) })
function requiredFlowId(request: RequestData) {
  if (!request.flowId)
    throw new TypeError('flowId is required for this operation')
  return request.flowId
}
async function execute(
  client: WhatsAppFlowsClientContract,
  phoneNumberId: string,
  request: RequestData,
) {
  const input = request.input ?? {}
  switch (request.action) {
    case 'create':
      return client.create(input as unknown as CreateFlowInput, timeout())
    case 'list':
      return client.list({ ...(input as ListFlowsOptions), ...timeout() })
    case 'get':
      return client.get(requiredFlowId(request), {
        ...(input as ListFlowsOptions),
        ...timeout(),
      })
    case 'preview':
      return client.getPreview(requiredFlowId(request), {
        ...(input as { invalidate?: boolean; unixTimestamp?: boolean }),
        ...timeout(),
      })
    case 'migrate':
      return client.migrate(input as unknown as MigrateFlowsInput, timeout())
    case 'updateMetadata':
      return client.updateMetadata(
        requiredFlowId(request),
        input as UpdateFlowMetadataInput,
        timeout(),
      )
    case 'uploadJson': {
      const document = input.document
      if (typeof document !== 'object' || document === null)
        throw new TypeError('input.document must be a Flow JSON object')
      return client.uploadJson(
        requiredFlowId(request),
        {
          file: new Blob([JSON.stringify(document)], {
            type: 'application/json',
          }),
        },
        timeout(),
      )
    }
    case 'listAssets':
      return client.listAssets(requiredFlowId(request), {
        ...(input as ListFlowsOptions),
        ...timeout(),
      })
    case 'publish':
      return client.publish(requiredFlowId(request), timeout())
    case 'deprecate':
      return client.deprecate(requiredFlowId(request), timeout())
    case 'delete':
      return client.delete(requiredFlowId(request), timeout())
    case 'metric':
      return client.getMetric(requiredFlowId(request), {
        ...(input as unknown as GetFlowMetricOptions),
        ...timeout(),
      })
    case 'getEncryptionKey':
      return client.getEncryptionPublicKey(phoneNumberId, timeout())
    case 'setEncryptionKey':
      return client.setEncryptionPublicKey(
        phoneNumberId,
        input as unknown as SetEncryptionPublicKeyInput,
        timeout(),
      )
  }
}
function isReadAction(action: RequestData['action']) {
  return [
    'list',
    'get',
    'preview',
    'listAssets',
    'metric',
    'getEncryptionKey',
  ].includes(action)
}
function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}
async function getOrganizationAccess(
  headers: Headers,
): Promise<Access | undefined> {
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
function flowsError(c: Context, error: unknown) {
  if (error instanceof WhatsAppFlowsApiError)
    return c.json(
      {
        message: `Meta rejected the Flows request: ${error.message}`,
        providerStatus: error.status,
      },
      502,
    )
  if (error instanceof WhatsAppFlowsResponseError)
    return c.json(
      { message: 'Meta returned an unexpected Flows response' },
      502,
    )
  if (error instanceof TypeError || error instanceof RangeError)
    return c.json({ message: error.message }, 400)
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
