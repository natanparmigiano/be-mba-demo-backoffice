import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppQrClient,
  WhatsAppQrApiError,
  WhatsAppQrResponseError,
  type QrCodeField,
  type WhatsAppQrClientContract,
} from '@mba-demo/wa-qr'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const qrCodeParamSchema = channelParamSchema.extend({
  code: z.string().trim().min(1).max(256),
})

const imageFormatSchema = z.enum(['PNG', 'SVG'])
const prefilledMessageSchema = z.string().trim().min(1).max(4_096)

const createQrCodeSchema = z.object({
  prefilledMessage: prefilledMessageSchema,
  imageFormat: imageFormatSchema.optional(),
})

const updateQrCodeSchema = z.object({
  prefilledMessage: prefilledMessageSchema,
})

const imageQuerySchema = z.object({ format: imageFormatSchema })

const listQrCodesSchema = z.object({
  fields: z
    .string()
    .trim()
    .max(200)
    .refine(
      (value) =>
        value.length === 0 ||
        value.split(',').every((field) => QR_CODE_FIELDS.has(field.trim())),
      { message: 'Fields must be supported QR code fields' },
    )
    .optional(),
  imageFormat: imageFormatSchema.optional(),
  limit: z.coerce.number().int().positive().max(1_000).optional(),
  before: z.string().trim().min(1).max(2_000).optional(),
  after: z.string().trim().min(1).max(2_000).optional(),
})

const QR_CODE_FIELDS: ReadonlySet<string> = new Set([
  'code',
  'prefilled_message',
  'deep_link_url',
])

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface QrPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface QrPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<QrPlaygroundConfiguration | undefined>
}

export interface QrPlaygroundRouteOptions {
  createQrClient?: (
    configuration: QrPlaygroundConfiguration,
  ) => WhatsAppQrClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: QrPlaygroundRepository
}

const databaseRepository: QrPlaygroundRepository = {
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

export const createQrPlaygroundRoute = ({
  createQrClient = defaultCreateQrClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: QrPlaygroundRouteOptions = {}) =>
  new Hono()
    .post(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('json', createQrCodeSchema),
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
          const result = await createQrClient(context.configuration).create(
            {
              prefilled_message: input.prefilledMessage,
              ...(input.imageFormat
                ? { generate_qr_image: input.imageFormat }
                : {}),
            },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return qrError(c, error)
        }
      },
    )
    .get(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('query', listQrCodesSchema),
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
        const fields = parseFields(query.fields)
        try {
          const result = await createQrClient(context.configuration).list({
            ...(fields.length > 0 ? { fields } : {}),
            ...(query.imageFormat ? { imageFormat: query.imageFormat } : {}),
            ...(query.limit === undefined ? {} : { limit: query.limit }),
            ...(query.before ? { before: query.before } : {}),
            ...(query.after ? { after: query.after } : {}),
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return qrError(c, error)
        }
      },
    )
    .get(
      '/:channelId/:code/image',
      zValidator('param', qrCodeParamSchema),
      zValidator('query', imageQuerySchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          false,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)

        const { code } = c.req.valid('param')
        try {
          const result = await createQrClient(
            context.configuration,
          ).getImageUrl(code, c.req.valid('query').format, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return qrError(c, error)
        }
      },
    )
    .get(
      '/:channelId/:code',
      zValidator('param', qrCodeParamSchema),
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
          const result = await createQrClient(context.configuration).get(
            c.req.valid('param').code,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return qrError(c, error)
        }
      },
    )
    .post(
      '/:channelId/:code',
      zValidator('param', qrCodeParamSchema),
      zValidator('json', updateQrCodeSchema),
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
          const result = await createQrClient(context.configuration).update(
            c.req.valid('param').code,
            { prefilled_message: c.req.valid('json').prefilledMessage },
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return qrError(c, error)
        }
      },
    )
    .delete(
      '/:channelId/:code',
      zValidator('param', qrCodeParamSchema),
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
          const result = await createQrClient(context.configuration).delete(
            c.req.valid('param').code,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return qrError(c, error)
        }
      },
    )

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<QrPlaygroundRouteOptions['getAccess']>,
  repository: QrPlaygroundRepository,
): Promise<
  | { status: 401 }
  | { status: 403 }
  | { status: 404 }
  | { status: 200; configuration: QrPlaygroundConfiguration }
> {
  const access = await getAccess(headers)
  if (!access) return { status: 401 }
  if (requiresManager && !canManageChannels(access.role)) {
    return { status: 403 }
  }
  const configuration = await repository.getConfiguration(
    access.organizationId,
    channelId,
  )
  return configuration ? { status: 200, configuration } : { status: 404 }
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

function defaultCreateQrClient(
  configuration: QrPlaygroundConfiguration,
): WhatsAppQrClientContract {
  return createWhatsAppQrClient({
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

function parseFields(value: string | undefined): QrCodeField[] {
  return value
    ? ([...new Set(value.split(',').map((field) => field.trim()))].filter(
        Boolean,
      ) as QrCodeField[])
    : []
}

function qrError(c: Context, error: unknown) {
  if (error instanceof WhatsAppQrApiError) {
    return c.json(
      {
        message: `Meta rejected the QR code request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppQrResponseError) {
    return c.json(
      { message: 'Meta returned an unexpected QR code response' },
      502,
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
