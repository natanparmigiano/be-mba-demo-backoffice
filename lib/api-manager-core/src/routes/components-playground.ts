import { auth } from '@mba-desk/auth'
import { channels, db, member } from '@mba-desk/db'
import {
  createWhatsAppComponentsClient,
  WhatsAppComponentsApiError,
  WhatsAppComponentsResponseError,
  type WhatsAppComponentsClientContract,
} from '@mba-desk/wa-components'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})
const commandSchema = z.object({
  commandName: z.string().trim().min(1).max(32),
  commandDescription: z.string().trim().min(1).max(256),
})
const writeComponentsSchema = z
  .object({
    commands: z.array(commandSchema).max(30).optional(),
    prompts: z.array(z.string().trim().min(1).max(80)).max(4).optional(),
  })
  .refine(
    (value) => value.commands !== undefined || value.prompts !== undefined,
    { message: 'At least one component field is required' },
  )

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface ComponentsPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface ComponentsPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<ComponentsPlaygroundConfiguration | undefined>
}

export interface ComponentsPlaygroundRouteOptions {
  createComponentsClient?: (
    configuration: ComponentsPlaygroundConfiguration,
  ) => WhatsAppComponentsClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ComponentsPlaygroundRepository
}

const databaseRepository: ComponentsPlaygroundRepository = {
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

export const createComponentsPlaygroundRoute = ({
  createComponentsClient = defaultCreateComponentsClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: ComponentsPlaygroundRouteOptions = {}) =>
  new Hono()
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
        const result = await createComponentsClient(
          context.configuration,
        ).getConfiguration({ signal: AbortSignal.timeout(15_000) })
        return c.json({ result })
      } catch (error) {
        return componentsError(c, error)
      }
    })
    .post(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('json', writeComponentsSchema),
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
          const result = await createComponentsClient(
            context.configuration,
          ).setConfiguration(
            {
              ...(input.commands === undefined
                ? {}
                : {
                    commands: input.commands.map((command) => ({
                      command_name: command.commandName,
                      command_description: command.commandDescription,
                    })),
                  }),
              ...(input.prompts === undefined
                ? {}
                : { prompts: input.prompts }),
            },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return componentsError(c, error)
        }
      },
    )

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<ComponentsPlaygroundRouteOptions['getAccess']>,
  repository: ComponentsPlaygroundRepository,
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

function defaultCreateComponentsClient(
  configuration: ComponentsPlaygroundConfiguration,
): WhatsAppComponentsClientContract {
  return createWhatsAppComponentsClient({
    accessToken: configuration.accessToken,
    phoneNumberId: configuration.phoneNumberId,
  })
}

function canManageChannels(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function componentsError(c: Context, error: unknown) {
  if (error instanceof WhatsAppComponentsApiError) {
    return c.json(
      {
        message: `Meta rejected the components request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppComponentsResponseError) {
    return c.json(
      { message: 'Meta returned an unexpected components response' },
      502,
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
