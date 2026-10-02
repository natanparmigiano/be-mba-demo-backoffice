import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import {
  createWhatsAppMediaClient,
  MEDIA_SIZE_LIMIT_BYTES,
  WhatsAppMediaApiError,
  WhatsAppMediaResponseError,
  type DocumentMimeType,
  type ImageMimeType,
  type UploadMediaInput,
  type VideoMimeType,
  type WhatsAppMediaClientContract,
} from '@mba-demo/wa-media'
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
const categorySchema = z.enum([
  'AUTHENTICATION',
  'FREE_SERVICE',
  'MARKETING',
  'UTILITY',
])
const creatableCategorySchema = z.enum([
  'AUTHENTICATION',
  'MARKETING',
  'UTILITY',
])
const statusSchema = z.enum([
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
const componentSchema = z
  .object({
    type: z.enum([
      'HEADER',
      'BODY',
      'FOOTER',
      'BUTTONS',
      'CAROUSEL',
      'LIMITED_TIME_OFFER',
    ]),
  })
  .loose()
const listSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
  name: z.string().trim().max(512).optional(),
  language: z.string().trim().max(35).optional(),
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  after: z.string().trim().min(1).max(2_000).optional(),
})
const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/),
    language: z.string().trim().min(1).max(35),
    category: creatableCategorySchema,
    components: z.array(componentSchema).min(1),
    parameter_format: z.enum(['NAMED', 'POSITIONAL']).optional(),
    allow_category_change: z.boolean().optional(),
    cta_url_link_tracking_opted_out: z.boolean().optional(),
    message_send_ttl_seconds: z.number().int().positive().optional(),
    is_primary_device_delivery_only: z.boolean().optional(),
    send_type: z.enum(['campaign', 'direct']).optional(),
  })
  .superRefine((input, context) =>
    validateTemplateComponents(
      input.components,
      input.parameter_format ?? 'POSITIONAL',
      input.category,
      context,
    ),
  )
const updateSchema = z
  .object({
    category: creatableCategorySchema.optional(),
    components: z.array(componentSchema).min(1).optional(),
    parameter_format: z.enum(['NAMED', 'POSITIONAL']).optional(),
    allow_category_change: z.boolean().optional(),
    message_send_ttl_seconds: z.number().int().positive().optional(),
    cta_url_link_tracking_opted_out: z.boolean().optional(),
    is_primary_device_delivery_only: z.boolean().optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: 'At least one template field is required',
    },
  )
  .superRefine((input, context) => {
    if (input.components) {
      validateTemplateComponents(
        input.components,
        input.parameter_format,
        input.category,
        context,
      )
    }
  })
const deleteSchema = z.object({
  name: z.string().trim().min(1).max(512),
})
const templateMediaUploadSchema = z
  .object({
    kind: z.enum(['image', 'video', 'document']),
    file: z.instanceof(File),
  })
  .superRefine(({ file, kind }, context) => {
    if (!file.size) {
      context.addIssue({
        code: 'custom',
        message: 'Template media file must not be empty',
        path: ['file'],
      })
    }
    if (!file.name.trim() || file.name.length > 255) {
      context.addIssue({
        code: 'custom',
        message: 'Template media filename must contain 1 to 255 characters',
        path: ['file'],
      })
    }
    if (
      !(TEMPLATE_MEDIA_MIME_TYPES[kind] as readonly string[]).includes(
        file.type,
      )
    ) {
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

const TEMPLATE_MEDIA_MIME_TYPES = {
  image: ['image/jpeg', 'image/png'],
  video: ['video/3gpp', 'video/mp4'],
  document: [
    'application/msword',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
} as const

function validateTemplateComponents(
  components: Array<Record<string, unknown> & { type: string }>,
  parameterFormat: 'NAMED' | 'POSITIONAL' | undefined,
  category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY' | undefined,
  context: z.RefinementCtx,
) {
  for (const type of ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'] as const) {
    if (components.filter((component) => component.type === type).length > 1) {
      issue(context, `Template can contain at most one ${type} component`)
    }
  }
  const body = components.find((component) => component.type === 'BODY')
  if (!body) issue(context, 'Template must contain a BODY component')
  else if (category !== 'AUTHENTICATION')
    validateText(body, 1_024, parameterFormat, 'body', context)

  const header = components.find((component) => component.type === 'HEADER')
  if (header) {
    if (
      !['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].includes(
        String(header.format),
      )
    ) {
      issue(context, 'HEADER format is invalid')
    } else if (header.format === 'TEXT') {
      validateText(header, 60, parameterFormat, 'header', context)
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(header.format))) {
      const example = isRecord(header.example) ? header.example : undefined
      if (
        !Array.isArray(example?.header_handle) ||
        typeof example.header_handle[0] !== 'string' ||
        !example.header_handle[0].trim()
      ) {
        issue(context, 'Media HEADER requires an uploaded example')
      }
    }
  }

  const footer = components.find((component) => component.type === 'FOOTER')
  if (
    footer &&
    (typeof footer.text !== 'string' ||
      !footer.text.trim() ||
      footer.text.length > 60 ||
      /{{\s*[^}]+\s*}}/.test(footer.text))
  ) {
    issue(context, 'FOOTER must contain 1 to 60 characters and no variables')
  }
  const buttons = components.find((component) => component.type === 'BUTTONS')
  if (buttons) validateButtons(buttons.buttons, context)
}

function validateText(
  component: Record<string, unknown>,
  maxLength: number,
  parameterFormat: 'NAMED' | 'POSITIONAL' | undefined,
  location: 'header' | 'body',
  context: z.RefinementCtx,
) {
  if (
    typeof component.text !== 'string' ||
    !component.text.trim() ||
    component.text.length > maxLength
  ) {
    issue(
      context,
      `${location.toUpperCase()} text must contain 1 to ${maxLength} characters`,
    )
    return
  }
  const keys = [...component.text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(
    (match) => match[1]!.trim(),
  )
  if (!keys.length) return
  const format =
    parameterFormat ??
    (keys.every((key) => /^\d+$/.test(key)) ? 'POSITIONAL' : 'NAMED')
  if (format === 'POSITIONAL') {
    const numbers = [...new Set(keys.map(Number))].sort((a, b) => a - b)
    if (numbers.some((number, index) => number !== index + 1)) {
      issue(
        context,
        'Positional variables must be sequential starting at {{1}}',
      )
      return
    }
  } else if (keys.some((key) => !/^[a-z][a-z0-9_]*$/.test(key))) {
    issue(context, 'Named variables must use lowercase snake_case names')
    return
  }
  if (!hasCompleteExamples(component.example, format, location, keys)) {
    issue(
      context,
      `${location.toUpperCase()} variables require non-empty example values`,
    )
  }
}

function hasCompleteExamples(
  value: unknown,
  format: 'NAMED' | 'POSITIONAL',
  location: 'header' | 'body',
  keys: string[],
) {
  if (!isRecord(value)) return false
  if (format === 'POSITIONAL') {
    const examples =
      location === 'body' &&
      Array.isArray(value.body_text) &&
      Array.isArray(value.body_text[0])
        ? value.body_text[0]
        : location === 'header' && Array.isArray(value.header_text)
          ? value.header_text
          : []
    return [...new Set(keys)].every(
      (_, index) =>
        typeof examples[index] === 'string' && Boolean(examples[index].trim()),
    )
  }
  const examples =
    location === 'body' && Array.isArray(value.body_text_named_params)
      ? value.body_text_named_params
      : location === 'header' && Array.isArray(value.header_text_named_params)
        ? value.header_text_named_params
        : []
  return [...new Set(keys)].every((key) =>
    examples.some(
      (entry) =>
        isRecord(entry) &&
        entry.param_name === key &&
        typeof entry.example === 'string' &&
        Boolean(entry.example.trim()),
    ),
  )
}

function validateButtons(value: unknown, context: z.RefinementCtx) {
  if (!Array.isArray(value) || !value.length || value.length > 10) {
    issue(context, 'BUTTONS must contain between 1 and 10 buttons')
    return
  }
  for (const button of value) {
    if (!isRecord(button) || typeof button.type !== 'string') {
      issue(context, 'Button is invalid')
      continue
    }
    if (
      button.type !== 'COPY_CODE' &&
      (typeof button.text !== 'string' ||
        !button.text.trim() ||
        button.text.length > 25)
    )
      issue(context, 'Button label must contain 1 to 25 characters')
    if (
      button.type === 'URL' &&
      (typeof button.url !== 'string' || !/^https?:\/\//.test(button.url))
    )
      issue(context, 'URL button requires an HTTP(S) URL')
    if (
      button.type === 'PHONE_NUMBER' &&
      (typeof button.phone_number !== 'string' ||
        !/^\+?[1-9]\d{6,14}$/.test(button.phone_number))
    )
      issue(context, 'Phone button requires a valid international number')
    if (
      button.type === 'COPY_CODE' &&
      (typeof button.example !== 'string' || !button.example.trim())
    )
      issue(context, 'Copy-code button requires an example')
    if (
      button.type === 'FLOW' &&
      typeof button.flow_id !== 'string' &&
      typeof button.flow_name !== 'string'
    )
      issue(context, 'Flow button requires a Flow ID or name')
  }
}

function issue(context: z.RefinementCtx, message: string) {
  context.addIssue({ code: 'custom', message, path: ['components'] })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface TemplatesConfiguration {
  wabaId: string
  phoneNumberId: string
  accessToken: string
}

export interface TemplatesRepository {
  getConfiguration: (
    organizationId: string,
    channelId: number,
  ) => Promise<TemplatesConfiguration | undefined>
}

export interface TemplatesRouteOptions {
  createTemplatesClient?: (
    configuration: TemplatesConfiguration,
  ) => WhatsAppTemplatesClientContract
  createMediaClient?: (
    configuration: TemplatesConfiguration,
  ) => WhatsAppMediaClientContract
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: TemplatesRepository
}

const databaseRepository: TemplatesRepository = {
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

const TEMPLATE_FIELDS = [
  'id',
  'name',
  'language',
  'status',
  'category',
  'previous_category',
  'correct_category',
  'components',
  'parameter_format',
  'message_send_ttl_seconds',
  'quality_score',
  'rejected_reason',
  'last_updated_time',
  'health_status',
].join(',')

export const createTemplatesRoute = ({
  createTemplatesClient = (configuration) =>
    createWhatsAppTemplatesClient(configuration),
  createMediaClient = (configuration) =>
    createWhatsAppMediaClient(configuration),
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: TemplatesRouteOptions = {}) =>
  new Hono()
    .get('/', zValidator('query', listSchema), async (c) => {
      const query = c.req.valid('query')
      const context = await getContext(
        c.req.raw.headers,
        query.channelId,
        false,
        getAccess,
        repository,
      )
      if (context.status !== 200) return contextError(c, context.status)
      try {
        const result = await createTemplatesClient(context.configuration).list({
          name: query.name,
          language: query.language,
          category: query.category,
          status: query.status,
          limit: query.limit,
          after: query.after,
          fields: TEMPLATE_FIELDS.split(','),
          signal: AbortSignal.timeout(15_000),
        })
        return c.json({ templates: result.data, paging: result.paging })
      } catch (error) {
        return templatesError(c, error)
      }
    })
    .post(
      '/:channelId/media',
      zValidator('param', channelParamSchema),
      zValidator('form', templateMediaUploadSchema),
      async (c) => {
        const context = await getContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          true,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        const { file, kind } = c.req.valid('form')
        try {
          const media = await createMediaClient(context.configuration).upload(
            toMediaInput(kind, file),
            { signal: AbortSignal.timeout(30_000) },
          )
          return c.json({ media })
        } catch (error) {
          return mediaError(c, error)
        }
      },
    )
    .post(
      '/:channelId',
      zValidator('param', channelParamSchema),
      zValidator('json', createSchema),
      async (c) => {
        const context = await getContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          true,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        try {
          const template = await createTemplatesClient(
            context.configuration,
          ).create(c.req.valid('json') as CreateTemplateInput, {
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ template }, 201)
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .get(
      '/:channelId/:templateId',
      zValidator('param', templateParamSchema),
      async (c) => {
        const context = await getContext(
          c.req.raw.headers,
          c.req.valid('param').channelId,
          false,
          getAccess,
          repository,
        )
        if (context.status !== 200) return contextError(c, context.status)
        try {
          const template = await createTemplatesClient(
            context.configuration,
          ).get(c.req.valid('param').templateId, {
            fields: TEMPLATE_FIELDS.split(','),
            signal: AbortSignal.timeout(15_000),
          })
          return c.json({ template })
        } catch (error) {
          return templatesError(c, error)
        }
      },
    )
    .patch(
      '/:channelId/:templateId',
      zValidator('param', templateParamSchema),
      zValidator('json', updateSchema),
      async (c) => {
        const context = await getContext(
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
            c.req.valid('json') as UpdateTemplateInput,
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
        const context = await getContext(
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

async function getContext(
  headers: Headers,
  channelId: number,
  requiresManager: boolean,
  getAccess: NonNullable<TemplatesRouteOptions['getAccess']>,
  repository: TemplatesRepository,
) {
  const access = await getAccess(headers)
  if (!access) return { status: 401 as const }
  if (requiresManager && !canManage(access.role)) {
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

function canManage(role: string) {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function templatesError(c: Context, error: unknown) {
  if (error instanceof WhatsAppTemplatesApiError) {
    return c.json(
      {
        message: `Meta rejected the template request: ${error.message}`,
        providerStatus: error.status,
        providerCode: error.code,
      },
      502,
    )
  }
  if (error instanceof WhatsAppTemplatesResponseError) {
    return c.json(
      {
        message: `Meta returned an invalid template response: ${error.message}`,
      },
      502,
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  throw error
}

function toMediaInput(
  kind: 'image' | 'video' | 'document',
  file: File,
): UploadMediaInput {
  const base = { file, filename: file.name }
  if (kind === 'image') {
    return { kind, ...base, mimeType: file.type as ImageMimeType }
  }
  if (kind === 'video') {
    return { kind, ...base, mimeType: file.type as VideoMimeType }
  }
  return { kind, ...base, mimeType: file.type as DocumentMimeType }
}

function mediaError(c: Context, error: unknown) {
  if (error instanceof WhatsAppMediaApiError) {
    return c.json(
      {
        message: `Meta rejected the template media upload: ${error.message}`,
        providerStatus: error.status,
      },
      502,
    )
  }
  if (error instanceof WhatsAppMediaResponseError) {
    return c.json(
      { message: `Meta returned an invalid media response: ${error.message}` },
      502,
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return c.json({ message: error.message }, 400)
  }
  throw error
}
