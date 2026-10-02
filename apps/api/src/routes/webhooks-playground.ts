import { auth } from '@mba-demo/auth'
import { channels, db, member } from '@mba-demo/db'
import { whatsappWebhookSchema } from '@mba-demo/wa-webhooks'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const channelParamSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
})

const requestSchema = z.object({
  payload: z.unknown(),
})

interface OrganizationAccess {
  organizationId: string
}

export interface WebhooksPlaygroundRepository {
  channelExists: (organizationId: string, channelId: number) => Promise<boolean>
}

export interface WebhooksPlaygroundRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: WebhooksPlaygroundRepository
  parseWebhook?: typeof whatsappWebhookSchema.safeParse
}

const databaseRepository: WebhooksPlaygroundRepository = {
  channelExists: async (organizationId, channelId) => {
    const [row] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.id, channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    return row !== undefined
  },
}

export const createWebhooksPlaygroundRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
  parseWebhook = whatsappWebhookSchema.safeParse.bind(whatsappWebhookSchema),
}: WebhooksPlaygroundRouteOptions = {}) =>
  new Hono().post(
    '/:channelId/validate',
    zValidator('param', channelParamSchema),
    zValidator('json', requestSchema),
    async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      const channelExists = await repository.channelExists(
        access.organizationId,
        c.req.valid('param').channelId,
      )
      if (!channelExists) return c.json({ message: 'Channel not found' }, 404)

      const parsed = parseWebhook(c.req.valid('json').payload)
      if (!parsed.success) {
        return c.json(
          {
            message: 'Invalid WhatsApp webhook payload',
            issues: parsed.error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path,
              message: issue.message,
            })),
          },
          400,
        )
      }

      return c.json({ result: parsed.data })
    },
  )

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined

  const [membership] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)
  return membership ? { organizationId } : undefined
}
