import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppRegistrationClient,
  WhatsAppRegistrationApiError,
  WhatsAppRegistrationResponseError,
  type WhatsAppRegistrationClientContract,
} from '@mba-demo/wa-registration'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const fieldsQuerySchema = z.object({
  fields: z
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
    .optional(),
})

const requestCodeSchema = z.object({
  codeMethod: z.enum(['SMS', 'VOICE']),
  language: z
    .string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$/),
})

const sixDigitCode = z.string().regex(/^\d{6}$/)
const verifyCodeSchema = z.object({ code: sixDigitCode })
const setPinSchema = z.object({ pin: sixDigitCode })
const registerSchema = setPinSchema.extend({
  dataLocalizationRegion: z
    .enum([
      'AU',
      'BH',
      'BR',
      'CA',
      'CH',
      'DE',
      'GB',
      'ID',
      'IN',
      'JP',
      'KR',
      'SG',
      'ZA',
      'AE',
    ])
    .optional(),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface RegistrationPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface ApiPlaygroundRepository {
  getRegistrationConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<RegistrationPlaygroundConfiguration | undefined>
}

export interface ApiPlaygroundRouteOptions {
  createRegistrationClient?: (
    configuration: RegistrationPlaygroundConfiguration,
  ) => WhatsAppRegistrationClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ApiPlaygroundRepository
}

const databaseRepository: ApiPlaygroundRepository = {
  getRegistrationConfiguration: async (organizationId, channelId) => {
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

export const createApiPlaygroundRoute = ({
  createRegistrationClient = defaultCreateRegistrationClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: ApiPlaygroundRouteOptions = {}) =>
  new Hono()
    .get(
      '/registration/:channelId/phone-number',
      zValidator('param', channelParamSchema),
      zValidator('query', fieldsQuerySchema),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)

        const configuration = await repository.getRegistrationConfiguration(
          access.organizationId,
          c.req.valid('param').channelId,
        )
        if (!configuration) return c.json({ message: 'Channel not found' }, 404)

        const fields = parseFields(c.req.valid('query').fields)
        try {
          const result = await createRegistrationClient(
            configuration,
          ).getPhoneNumber({
            ...(fields.length > 0 ? { fields } : {}),
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return playgroundError(c, error)
        }
      },
    )
    .post(
      '/registration/:channelId/request-code',
      zValidator('param', channelParamSchema),
      zValidator('json', requestCodeSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        const input = c.req.valid('json')
        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).requestVerificationCode(
            { code_method: input.codeMethod, language: input.language },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return playgroundError(c, error)
        }
      },
    )
    .post(
      '/registration/:channelId/verify-code',
      zValidator('param', channelParamSchema),
      zValidator('json', verifyCodeSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).verifyCode(c.req.valid('json'), {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return playgroundError(c, error)
        }
      },
    )
    .post(
      '/registration/:channelId/register',
      zValidator('param', channelParamSchema),
      zValidator('json', registerSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        const input = c.req.valid('json')
        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).register(
            {
              pin: input.pin,
              ...(input.dataLocalizationRegion
                ? {
                    data_localization_region: input.dataLocalizationRegion,
                  }
                : {}),
            },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return playgroundError(c, error)
        }
      },
    )
    .post(
      '/registration/:channelId/two-step-pin',
      zValidator('param', channelParamSchema),
      zValidator('json', setPinSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).setTwoStepVerificationPin(c.req.valid('json'), {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return playgroundError(c, error)
        }
      },
    )
    .post(
      '/registration/:channelId/deregister',
      zValidator('param', channelParamSchema),
      async (c) => {
        const context = await getMutationContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          getAccess,
          repository,
        )
        if (context.status === 401)
          return c.json({ message: 'Unauthorized' }, 401)
        if (context.status === 403)
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        if (context.status === 404)
          return c.json({ message: 'Channel not found' }, 404)

        try {
          const result = await createRegistrationClient(
            context.configuration,
          ).deregister({ signal: AbortSignal.timeout(15_000) })
          return c.json({ result })
        } catch (error) {
          return playgroundError(c, error)
        }
      },
    )

async function getMutationContext(
  headers: Headers,
  channelId: number,
  getAccess: NonNullable<ApiPlaygroundRouteOptions['getAccess']>,
  repository: ApiPlaygroundRepository,
): Promise<
  | { status: 401 }
  | { status: 403 }
  | { status: 404 }
  | { status: 200; configuration: RegistrationPlaygroundConfiguration }
> {
  const access = await getAccess(headers)
  if (!access) return { status: 401 }
  if (!canManageChannels(access.role)) return { status: 403 }
  const configuration = await repository.getRegistrationConfiguration(
    access.organizationId,
    channelId,
  )
  return configuration ? { status: 200, configuration } : { status: 404 }
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

function defaultCreateRegistrationClient(
  configuration: RegistrationPlaygroundConfiguration,
): WhatsAppRegistrationClientContract {
  return createWhatsAppRegistrationClient({
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

function parseFields(value: string | undefined): string[] {
  return value
    ? [...new Set(value.split(',').map((field) => field.trim()))].filter(
        Boolean,
      )
    : []
}

function playgroundError(c: Context, error: unknown) {
  if (error instanceof WhatsAppRegistrationApiError) {
    return c.json(
      {
        message: `Meta rejected the registration request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppRegistrationResponseError) {
    return c.json(
      { message: 'Meta returned an unexpected registration response' },
      502,
    )
  }
  if (error instanceof TypeError) {
    return c.json({ message: error.message }, 400)
  }
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
