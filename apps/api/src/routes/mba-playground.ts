import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppMbaClient,
  WhatsAppMbaApiError,
  WhatsAppMbaResponseError,
  type WhatsAppMbaClientContract,
} from '@mba-demo/wa-mba'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

export const mbaReadActions = [
  'getEligibility',
  'getSettings',
  'listAllowlist',
  'getBudgets',
  'listConnectors',
  'getConnector',
  'getConnectorLogs',
  'listConnectorTools',
  'getConnectorTool',
  'listSkills',
  'getSkill',
  'listUiSkills',
  'getUiSkill',
  'getBusinessInfo',
  'listFaqs',
  'getFaq',
  'listKnowledgeFiles',
  'getKnowledgeFile',
  'listKnowledgeWebsites',
  'getKnowledgeWebsite',
  'listEvaluationCases',
  'getEvaluationJob',
  'getEvaluationDetails',
  'getEvaluationSummaries',
  'getAgentEvent',
  'getAgentEventInsights',
  'getConversationTurns',
  'getConversationInsights',
  'getToolCallInsights',
] as const

export const mbaMutationActions = [
  'onboard',
  'updateSettings',
  'addAllowlistEntry',
  'removeAllowlistEntry',
  'replaceBudgets',
  'deleteAgent',
  'runTest',
  'createConnector',
  'updateConnector',
  'deleteConnector',
  'refreshMcpTools',
  'upsertConnectorApiKey',
  'upsertConnectorOAuth',
  'upsertConnectorCertificate',
  'createConnectorTool',
  'updateConnectorTool',
  'runConnectorTool',
  'deleteConnectorTool',
  'createSkill',
  'updateSkill',
  'deleteSkill',
  'createUiSkill',
  'updateUiSkill',
  'deleteUiSkill',
  'replaceBusinessInfo',
  'resetBusinessInfo',
  'createFaq',
  'updateFaq',
  'deleteFaq',
  'deleteKnowledgeFile',
  'createKnowledgeWebsite',
  'updateKnowledgeWebsite',
  'deleteKnowledgeWebsite',
  'runEvaluation',
  'sendAgentEvent',
  'transferThreadControl',
] as const

const actions = [...mbaReadActions, ...mbaMutationActions] as const
const requestSchema = z.object({
  action: z.enum(actions),
  arguments: z.array(z.unknown()).max(3).default([]),
  options: z.record(z.string(), z.unknown()).default({}),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}
export interface MbaPlaygroundConfiguration {
  accessToken: string
  phoneNumberId: string
  businessId: string
}
export interface MbaPlaygroundRepository {
  getConfiguration(
    organizationId: string,
    channelId: number,
  ): Promise<MbaPlaygroundConfiguration | undefined>
}
export interface MbaPlaygroundRouteOptions {
  createMbaClient?: (
    configuration: MbaPlaygroundConfiguration,
  ) => WhatsAppMbaClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: MbaPlaygroundRepository
}

const databaseRepository: MbaPlaygroundRepository = {
  getConfiguration: async (organizationId, channelId) => {
    const [row] = await db
      .select({
        accessToken: channels.waSystemUserAccessToken,
        phoneNumberId: channels.waPhoneNumberId,
        businessId: channels.waBusinessId,
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

export const createMbaPlaygroundRoute = ({
  createMbaClient = createWhatsAppMbaClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: MbaPlaygroundRouteOptions = {}) =>
  new Hono().post(
    '/:channelId',
    zValidator('param', channelParamSchema),
    zValidator('json', requestSchema),
    async (c) => {
      const request = c.req.valid('json')
      const access = await getAccess(c.req.raw.headers)
      if (!access) return contextError(c, 401)
      if (isMutation(request.action) && !canManage(access.role))
        return contextError(c, 403)
      const configuration = await repository.getConfiguration(
        access.organizationId,
        c.req.valid('param').channelId,
      )
      if (!configuration) return contextError(c, 404)
      try {
        const client = createMbaClient(configuration)
        const result = await (
          client[request.action] as unknown as (
            ...args: unknown[]
          ) => Promise<unknown>
        ).apply(client, [
          ...request.arguments,
          {
            ...request.options,
            signal: AbortSignal.timeout(15_000),
          },
        ])
        return c.json({ result: result ?? null })
      } catch (error) {
        return mbaError(c, error)
      }
    },
  )

function isMutation(action: (typeof actions)[number]): boolean {
  return (mbaMutationActions as readonly string[]).includes(action)
}
function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
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
function mbaError(c: Context, error: unknown) {
  if (error instanceof WhatsAppMbaApiError)
    return c.json(
      {
        message: `Meta rejected the MBA request: ${error.message}`,
        providerStatus: error.status,
        ...('code' in error && error.code !== undefined
          ? { providerCode: error.code }
          : {}),
      },
      502,
    )
  if (error instanceof WhatsAppMbaResponseError)
    return c.json({ message: 'Meta returned an unexpected MBA response' }, 502)
  if (error instanceof TypeError || error instanceof RangeError)
    return c.json({ message: error.message }, 400)
  return c.json({ message: 'Could not reach the Meta Business Agent API' }, 502)
}
