import { auth } from '@mba-desk/auth'
import { channels, db, groups, member } from '@mba-desk/db'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, ilike, lt, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

const listGroupsQuerySchema = z.object({
  channelId: z.coerce.number().int().positive().optional(),
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(200).optional(),
})

const groupCursorSchema = z.object({
  id: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
})

interface OrganizationAccess {
  organizationId: string
}

interface GroupCursor {
  id: number
  updatedAt: string
}

export interface GroupSummary {
  id: number
  channel: {
    id: number
    name: string
    waPhoneNumber: string
  }
  providerGroupId: string
  subject: string | null
  description: string | null
  joinApprovalMode: string | null
  lastWebhookField: string | null
  lastEventType: string | null
  lastEventAt: string | null
  firstSeenAt: string
  updatedAt: string
}

export interface GroupDetail extends GroupSummary {
  inviteLink: string | null
  rawGroup: unknown
}

interface GroupListQuery {
  channelId?: number
  cursor?: GroupCursor
  limit: number
  search: string
}

interface GroupListResult {
  groups: GroupSummary[]
  nextCursor: string | null
}

export interface GroupsRepository {
  list: (
    organizationId: string,
    query: GroupListQuery,
  ) => Promise<GroupListResult>
  get: (
    organizationId: string,
    groupId: number,
  ) => Promise<GroupDetail | undefined>
}

export interface GroupsRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: GroupsRepository
}

const databaseRepository: GroupsRepository = {
  list: listGroups,
  get: getGroup,
}

export const createGroupsRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: GroupsRouteOptions = {}) =>
  new Hono()
    .get(
      '/',
      zValidator('query', listGroupsQuerySchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid groups query' }, 400)
        }
      }),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)

        const query = c.req.valid('query')
        const cursor = query.cursor
          ? decodeGroupCursor(query.cursor)
          : undefined
        if (query.cursor && !cursor) {
          return c.json({ message: 'Invalid cursor' }, 400)
        }

        return c.json(
          await repository.list(access.organizationId, {
            channelId: query.channelId,
            cursor,
            limit: query.limit,
            search: query.search ?? '',
          }),
        )
      },
    )
    .get('/:id', async (c) => {
      const groupId = parsePositiveSafeInteger(c.req.param('id'))
      if (!groupId) return c.json({ message: 'Invalid group ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      const group = await repository.get(access.organizationId, groupId)
      if (!group) return c.json({ message: 'Group not found' }, 404)
      return c.json({ group })
    })

async function listGroups(
  organizationId: string,
  query: GroupListQuery,
): Promise<GroupListResult> {
  const conditions: SQL[] = [eq(channels.organizationId, organizationId)]

  if (query.channelId) {
    conditions.push(eq(groups.channelId, query.channelId))
  }

  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`
    const searchCondition = or(
      ilike(groups.subject, pattern),
      ilike(groups.description, pattern),
      ilike(groups.providerGroupId, pattern),
      ilike(groups.inviteLink, pattern),
      ilike(groups.lastEventType, pattern),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  if (query.cursor) {
    const cursorDate = new Date(query.cursor.updatedAt)
    const cursorCondition = or(
      lt(groups.updatedAt, cursorDate),
      and(eq(groups.updatedAt, cursorDate), lt(groups.id, query.cursor.id)),
    )
    if (cursorCondition) conditions.push(cursorCondition)
  }

  const rows = await db
    .select({
      id: groups.id,
      channelId: channels.id,
      channelPhoneNumber: channels.waPhoneNumber,
      channelName: channels.name,
      providerGroupId: groups.providerGroupId,
      subject: groups.subject,
      description: groups.description,
      joinApprovalMode: groups.joinApprovalMode,
      lastWebhookField: groups.lastWebhookField,
      lastEventType: groups.lastEventType,
      lastEventAt: groups.lastEventAt,
      firstSeenAt: groups.firstSeenAt,
      updatedAt: groups.updatedAt,
    })
    .from(groups)
    .innerJoin(channels, eq(groups.channelId, channels.id))
    .where(and(...conditions))
    .orderBy(desc(groups.updatedAt), desc(groups.id))
    .limit(query.limit + 1)

  const pageRows = rows.slice(0, query.limit)
  const lastGroup = pageRows.at(-1)

  return {
    groups: pageRows.map(toGroupSummary),
    nextCursor:
      rows.length > query.limit && lastGroup
        ? encodeGroupCursor({
            id: lastGroup.id,
            updatedAt: lastGroup.updatedAt.toISOString(),
          })
        : null,
  }
}

async function getGroup(
  organizationId: string,
  groupId: number,
): Promise<GroupDetail | undefined> {
  const [row] = await db
    .select({
      id: groups.id,
      channelId: channels.id,
      channelPhoneNumber: channels.waPhoneNumber,
      channelName: channels.name,
      providerGroupId: groups.providerGroupId,
      subject: groups.subject,
      description: groups.description,
      inviteLink: groups.inviteLink,
      joinApprovalMode: groups.joinApprovalMode,
      lastWebhookField: groups.lastWebhookField,
      lastEventType: groups.lastEventType,
      lastEventAt: groups.lastEventAt,
      rawGroup: groups.rawGroup,
      firstSeenAt: groups.firstSeenAt,
      updatedAt: groups.updatedAt,
    })
    .from(groups)
    .innerJoin(channels, eq(groups.channelId, channels.id))
    .where(
      and(eq(groups.id, groupId), eq(channels.organizationId, organizationId)),
    )
    .limit(1)

  return row
    ? {
        ...toGroupSummary(row),
        inviteLink: row.inviteLink,
        rawGroup: row.rawGroup,
      }
    : undefined
}

function toGroupSummary(row: {
  id: number
  channelId: number
  channelPhoneNumber: string
  channelName: string
  providerGroupId: string
  subject: string | null
  description: string | null
  joinApprovalMode: string | null
  lastWebhookField: string | null
  lastEventType: string | null
  lastEventAt: Date | null
  firstSeenAt: Date
  updatedAt: Date
}): GroupSummary {
  return {
    id: row.id,
    channel: {
      id: row.channelId,
      name: row.channelName,
      waPhoneNumber: row.channelPhoneNumber,
    },
    providerGroupId: row.providerGroupId,
    subject: row.subject,
    description: row.description,
    joinApprovalMode: row.joinApprovalMode,
    lastWebhookField: row.lastWebhookField,
    lastEventType: row.lastEventType,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
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

export function encodeGroupCursor(cursor: GroupCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeGroupCursor(value: string): GroupCursor | undefined {
  try {
    return groupCursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
  } catch {
    return undefined
  }
}

function parsePositiveSafeInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}
