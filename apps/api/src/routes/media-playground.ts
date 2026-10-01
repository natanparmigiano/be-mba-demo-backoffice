import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppMediaClient,
  MEDIA_SIZE_LIMIT_BYTES,
  WhatsAppMediaApiError,
  WhatsAppMediaResponseError,
  type AudioMimeType,
  type DocumentMimeType,
  type ImageMimeType,
  type MediaKind,
  type StickerMimeType,
  type UploadMediaInput,
  type VideoMimeType,
  type WhatsAppMediaClientContract,
} from '@mba-demo/wa-media'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const mediaParamSchema = channelParamSchema.extend({
  mediaId: z.string().trim().min(1).max(1_000),
})

const mediaKindSchema = z.enum([
  'audio',
  'document',
  'image',
  'sticker',
  'video',
])

const uploadSchema = z
  .object({
    kind: mediaKindSchema,
    file: z.instanceof(File),
  })
  .superRefine(({ file, kind }, context) => {
    if (file.size === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Media file must not be empty',
        path: ['file'],
      })
    }
    if (file.name.trim().length === 0 || file.name.length > 255) {
      context.addIssue({
        code: 'custom',
        message: 'Media filename must contain 1 to 255 characters',
        path: ['file'],
      })
    }
    if (!(MEDIA_MIME_TYPES[kind] as readonly string[]).includes(file.type)) {
      context.addIssue({
        code: 'custom',
        message: `Unsupported ${kind} MIME type`,
        path: ['file'],
      })
    }
    if (file.size > MEDIA_SIZE_LIMIT_BYTES[kind]) {
      context.addIssue({
        code: 'custom',
        message: `${kind} exceeds the WhatsApp upload limit`,
        path: ['file'],
      })
    }
  })

const MEDIA_MIME_TYPES = {
  audio: ['audio/aac', 'audio/amr', 'audio/mp4', 'audio/mpeg', 'audio/ogg'],
  document: [
    'application/msword',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  image: ['image/jpeg', 'image/png'],
  sticker: ['image/webp'],
  video: ['video/3gpp', 'video/mp4'],
} as const satisfies Record<MediaKind, readonly string[]>

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface MediaPlaygroundConfiguration {
  phoneNumberId: string
  accessToken: string
}

export interface MediaPlaygroundRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<MediaPlaygroundConfiguration | undefined>
}

export interface MediaPlaygroundRouteOptions {
  createMediaClient?: (
    configuration: MediaPlaygroundConfiguration,
  ) => WhatsAppMediaClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: MediaPlaygroundRepository
}

const databaseRepository: MediaPlaygroundRepository = {
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

export const createMediaPlaygroundRoute = ({
  createMediaClient = defaultCreateMediaClient,
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: MediaPlaygroundRouteOptions = {}) =>
  new Hono()
    .post(
      '/:channelId/upload',
      zValidator('param', channelParamSchema),
      zValidator('form', uploadSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          true,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)

        const { file, kind } = c.req.valid('form')
        try {
          const result = await createMediaClient(context.configuration).upload(
            toUploadInput(kind, file),
            { signal: AbortSignal.timeout(30_000) },
          )
          return c.json({ result })
        } catch (error) {
          return mediaError(c, error)
        }
      },
    )
    .get(
      '/:channelId/:mediaId/download',
      zValidator('param', mediaParamSchema),
      async (c) => {
        const context = await getChannelContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          false,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)

        const client = createMediaClient(context.configuration)
        const signal = AbortSignal.timeout(30_000)
        try {
          const metadata = await client.getMediaUrl(
            c.req.valid('param').mediaId,
            { signal },
          )
          const result = await client.download(metadata.url, { signal })
          const body = result.data.slice().buffer
          return new Response(body, {
            headers: {
              'cache-control': 'private, no-store',
              'content-disposition': `attachment; filename="${safeDownloadName(metadata.id)}"`,
              'content-length': String(result.data.byteLength),
              'content-type': result.contentType ?? metadata.mime_type,
            },
          })
        } catch (error) {
          return mediaError(c, error)
        }
      },
    )
    .get(
      '/:channelId/:mediaId',
      zValidator('param', mediaParamSchema),
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
          const result = await createMediaClient(
            context.configuration,
          ).getMediaUrl(c.req.valid('param').mediaId, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ result })
        } catch (error) {
          return mediaError(c, error)
        }
      },
    )
    .delete(
      '/:channelId/:mediaId',
      zValidator('param', mediaParamSchema),
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
          const result = await createMediaClient(context.configuration).delete(
            c.req.valid('param').mediaId,
            { signal: AbortSignal.timeout(15_000) },
          )
          return c.json({ result })
        } catch (error) {
          return mediaError(c, error)
        }
      },
    )

async function getChannelContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<MediaPlaygroundRouteOptions['getAccess']>,
  repository: MediaPlaygroundRepository,
): Promise<
  | { status: 401 }
  | { status: 403 }
  | { status: 404 }
  | { status: 200; configuration: MediaPlaygroundConfiguration }
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

function defaultCreateMediaClient(
  configuration: MediaPlaygroundConfiguration,
): WhatsAppMediaClientContract {
  return createWhatsAppMediaClient({
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

function toUploadInput(kind: MediaKind, file: File): UploadMediaInput {
  const input = { file, filename: file.name }
  switch (kind) {
    case 'audio':
      return { kind, ...input, mimeType: file.type as AudioMimeType }
    case 'document':
      return { kind, ...input, mimeType: file.type as DocumentMimeType }
    case 'image':
      return { kind, ...input, mimeType: file.type as ImageMimeType }
    case 'sticker':
      return { kind, ...input, mimeType: file.type as StickerMimeType }
    case 'video':
      return { kind, ...input, mimeType: file.type as VideoMimeType }
  }
}

function safeDownloadName(mediaId: string): string {
  const normalized = mediaId.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 180)
  return normalized || 'whatsapp-media'
}

function mediaError(c: Context, error: unknown) {
  if (error instanceof WhatsAppMediaApiError) {
    return c.json(
      {
        message: `Meta rejected the media request: ${error.message}`,
        providerStatus: error.status,
        ...(error.code === undefined ? {} : { providerCode: error.code }),
        ...(error.subcode === undefined
          ? {}
          : { providerSubcode: error.subcode }),
      },
      502,
    )
  }
  if (error instanceof WhatsAppMediaResponseError) {
    return c.json(
      { message: 'Meta returned an unexpected media response' },
      502,
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  return c.json({ message: 'Could not reach the Meta Graph API' }, 502)
}
