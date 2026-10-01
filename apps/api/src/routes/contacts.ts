import { auth } from '@mba-demo/auth'
import { channels, contacts, db, member } from '@mba-demo/db'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, ilike, lt, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

const listContactsQuerySchema = z.object({
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

const contactCursorSchema = z.object({
  id: z.number().int().positive(),
  lastSeenAt: z.string().datetime({ offset: true }),
})

interface OrganizationAccess {
  organizationId: string
}

interface ContactCursor {
  id: number
  lastSeenAt: string
}

export interface ContactSummary {
  id: number
  channel: {
    id: number
    waPhoneNumber: string
  }
  waId: string | null
  userId: string | null
  profileName: string | null
  profileUsername: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface ContactDetail extends ContactSummary {
  parentUserId: string | null
  identityKeyHash: string | null
  input: string | null
  rawContact: unknown
}

interface ContactListQuery {
  channelId?: number
  cursor?: ContactCursor
  limit: number
  search: string
}

interface ContactListResult {
  contacts: ContactSummary[]
  nextCursor: string | null
}

export interface ContactsRepository {
  list: (
    organizationId: string,
    query: ContactListQuery,
  ) => Promise<ContactListResult>
  get: (
    organizationId: string,
    contactId: number,
  ) => Promise<ContactDetail | undefined>
}

export interface ContactsRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ContactsRepository
}

const databaseRepository: ContactsRepository = {
  list: listContacts,
  get: getContact,
}

export const createContactsRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: ContactsRouteOptions = {}) =>
  new Hono()
    .get(
      '/',
      zValidator('query', listContactsQuerySchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid contacts query' }, 400)
        }
      }),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)

        const query = c.req.valid('query')
        const cursor = query.cursor
          ? decodeContactCursor(query.cursor)
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
      const contactId = parsePositiveSafeInteger(c.req.param('id'))
      if (!contactId) return c.json({ message: 'Invalid contact ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      const contact = await repository.get(access.organizationId, contactId)
      if (!contact) return c.json({ message: 'Contact not found' }, 404)
      return c.json({ contact })
    })

async function listContacts(
  organizationId: string,
  query: ContactListQuery,
): Promise<ContactListResult> {
  const conditions: SQL[] = [eq(channels.organizationId, organizationId)]

  if (query.channelId) {
    conditions.push(eq(contacts.channelId, query.channelId))
  }

  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`
    const searchCondition = or(
      ilike(contacts.profileName, pattern),
      ilike(contacts.profileUsername, pattern),
      ilike(contacts.waId, pattern),
      ilike(contacts.userId, pattern),
      ilike(contacts.input, pattern),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  if (query.cursor) {
    const cursorDate = new Date(query.cursor.lastSeenAt)
    const cursorCondition = or(
      lt(contacts.lastSeenAt, cursorDate),
      and(
        eq(contacts.lastSeenAt, cursorDate),
        lt(contacts.id, query.cursor.id),
      ),
    )
    if (cursorCondition) conditions.push(cursorCondition)
  }

  const rows = await db
    .select({
      id: contacts.id,
      channelId: channels.id,
      channelPhoneNumber: channels.waPhoneNumber,
      waId: contacts.waId,
      userId: contacts.userId,
      profileName: contacts.profileName,
      profileUsername: contacts.profileUsername,
      firstSeenAt: contacts.firstSeenAt,
      lastSeenAt: contacts.lastSeenAt,
    })
    .from(contacts)
    .innerJoin(channels, eq(contacts.channelId, channels.id))
    .where(and(...conditions))
    .orderBy(desc(contacts.lastSeenAt), desc(contacts.id))
    .limit(query.limit + 1)

  const pageRows = rows.slice(0, query.limit)
  const lastContact = pageRows.at(-1)

  return {
    contacts: pageRows.map(toContactSummary),
    nextCursor:
      rows.length > query.limit && lastContact
        ? encodeContactCursor({
            id: lastContact.id,
            lastSeenAt: lastContact.lastSeenAt.toISOString(),
          })
        : null,
  }
}

async function getContact(
  organizationId: string,
  contactId: number,
): Promise<ContactDetail | undefined> {
  const [row] = await db
    .select({
      id: contacts.id,
      channelId: channels.id,
      channelPhoneNumber: channels.waPhoneNumber,
      waId: contacts.waId,
      userId: contacts.userId,
      parentUserId: contacts.parentUserId,
      identityKeyHash: contacts.identityKeyHash,
      input: contacts.input,
      profileName: contacts.profileName,
      profileUsername: contacts.profileUsername,
      rawContact: contacts.rawContact,
      firstSeenAt: contacts.firstSeenAt,
      lastSeenAt: contacts.lastSeenAt,
    })
    .from(contacts)
    .innerJoin(channels, eq(contacts.channelId, channels.id))
    .where(
      and(
        eq(contacts.id, contactId),
        eq(channels.organizationId, organizationId),
      ),
    )
    .limit(1)

  return row
    ? {
        ...toContactSummary(row),
        parentUserId: row.parentUserId,
        identityKeyHash: row.identityKeyHash,
        input: row.input,
        rawContact: row.rawContact,
      }
    : undefined
}

function toContactSummary(row: {
  id: number
  channelId: number
  channelPhoneNumber: string
  waId: string | null
  userId: string | null
  profileName: string | null
  profileUsername: string | null
  firstSeenAt: Date
  lastSeenAt: Date
}): ContactSummary {
  return {
    id: row.id,
    channel: {
      id: row.channelId,
      waPhoneNumber: row.channelPhoneNumber,
    },
    waId: row.waId,
    userId: row.userId,
    profileName: row.profileName,
    profileUsername: row.profileUsername,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
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

export function encodeContactCursor(cursor: ContactCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeContactCursor(value: string): ContactCursor | undefined {
  try {
    return contactCursorSchema.parse(
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
