import { auth } from '@mba-demo/auth'
import { channels, db, member, webhooks } from '@mba-demo/db'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, lt, lte, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const querySchema = z.object({
  channelId: z.coerce.number().int().positive().optional(),
  cursor: z.string().trim().min(1).max(500).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})
const exportQuerySchema = z
  .object({
    channelId: z.coerce.number().int().positive(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .refine((query) => new Date(query.from) <= new Date(query.to), {
    message: 'Start time must not be after end time',
  })

interface Cursor {
  id: number
  arrivedAt: string
}
interface Access {
  organizationId: string
}

export interface WebhooksRouteOptions {
  getAccess?: (headers: Headers) => Promise<Access | undefined>
}

export const createWebhooksRoute = ({
  getAccess = getOrganizationAccess,
}: WebhooksRouteOptions = {}) =>
  new Hono()
    .get(
      '/export',
      zValidator('query', exportQuerySchema, (result, c) =>
        result.success
          ? undefined
          : c.json({ message: 'Invalid webhook export query' }, 400),
      ),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const query = c.req.valid('query')
        const rows = await db
          .select({
            id: webhooks.id,
            channelId: webhooks.channelId,
            payload: webhooks.payload,
            arrivedAt: webhooks.arrivedAt,
            processingStartedAt: webhooks.processingStartedAt,
            processedAt: webhooks.processedAt,
            processingTimeMs: webhooks.processingTimeMs,
            totalTimeMs: webhooks.totalTimeMs,
          })
          .from(webhooks)
          .innerJoin(channels, eq(channels.id, webhooks.channelId))
          .where(
            and(
              eq(channels.organizationId, access.organizationId),
              eq(webhooks.channelId, query.channelId),
              gte(webhooks.arrivedAt, new Date(query.from)),
              lte(webhooks.arrivedAt, new Date(query.to)),
            ),
          )
          .orderBy(desc(webhooks.arrivedAt), desc(webhooks.id))

        const body = rows
          .map((row) =>
            JSON.stringify({
              ...row,
              arrivedAt: row.arrivedAt.toISOString(),
              processingStartedAt: row.processingStartedAt.toISOString(),
              processedAt: row.processedAt.toISOString(),
            }),
          )
          .join('\n')
        const date = new Date().toISOString().slice(0, 10)
        return new Response(body ? `${body}\n` : '', {
          headers: {
            'content-disposition': `attachment; filename="webhooks-${query.channelId}-${date}.jsonl"`,
            'content-type': 'application/x-ndjson; charset=utf-8',
          },
        })
      },
    )
    .get(
      '/',
      zValidator('query', querySchema, (result, c) =>
        result.success
          ? undefined
          : c.json({ message: 'Invalid webhooks query' }, 400),
      ),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        const query = c.req.valid('query')
        const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
        if (query.cursor && !cursor)
          return c.json({ message: 'Invalid cursor' }, 400)

        const conditions: SQL[] = [
          eq(channels.organizationId, access.organizationId),
        ]
        if (query.channelId)
          conditions.push(eq(webhooks.channelId, query.channelId))
        if (query.from)
          conditions.push(gte(webhooks.arrivedAt, new Date(query.from)))
        if (query.to)
          conditions.push(lte(webhooks.arrivedAt, new Date(query.to)))
        if (cursor) {
          const date = new Date(cursor.arrivedAt)
          const condition = or(
            lt(webhooks.arrivedAt, date),
            and(eq(webhooks.arrivedAt, date), lt(webhooks.id, cursor.id)),
          )
          if (condition) conditions.push(condition)
        }

        const rows = await db
          .select({
            id: webhooks.id,
            channelId: webhooks.channelId,
            channelPhoneNumber: channels.waPhoneNumber,
            payload: webhooks.payload,
            arrivedAt: webhooks.arrivedAt,
            processingStartedAt: webhooks.processingStartedAt,
            processedAt: webhooks.processedAt,
            processingTimeMs: webhooks.processingTimeMs,
            totalTimeMs: webhooks.totalTimeMs,
          })
          .from(webhooks)
          .innerJoin(channels, eq(channels.id, webhooks.channelId))
          .where(and(...conditions))
          .orderBy(desc(webhooks.arrivedAt), desc(webhooks.id))
          .limit(query.limit + 1)

        const hasMore = rows.length > query.limit
        const page = rows.slice(0, query.limit).map((row) => ({
          ...row,
          arrivedAt: row.arrivedAt.toISOString(),
          processingStartedAt: row.processingStartedAt.toISOString(),
          processedAt: row.processedAt.toISOString(),
        }))
        const last = page.at(-1)
        return c.json({
          webhooks: page,
          nextCursor:
            hasMore && last
              ? Buffer.from(
                  JSON.stringify({ id: last.id, arrivedAt: last.arrivedAt }),
                ).toString('base64url')
              : null,
        })
      },
    )

function decodeCursor(value: string): Cursor | undefined {
  try {
    return z
      .object({
        id: z.number().int().positive(),
        arrivedAt: z.string().datetime({ offset: true }),
      })
      .parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch {
    return undefined
  }
}

async function getOrganizationAccess(
  headers: Headers,
): Promise<Access | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined
  const [membership] = await db
    .select({ id: member.id })
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
