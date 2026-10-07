import { auth } from '@mba-desk/auth'
import {
  channels,
  chatEvents,
  chats,
  contacts,
  db,
  member,
  messages,
  messageStatusEvents,
} from '@mba-desk/db'
import { zValidator } from '@hono/zod-validator'
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  type SQL,
} from 'drizzle-orm'
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

const optionalText = z.string().trim().max(500).optional()
const createContactSchema = z.object({
  channelId: z.number().int().positive(),
  waId: z.string().trim().min(1).max(500),
  profileName: optionalText,
  profileUsername: optionalText,
})
const updateContactSchema = createContactSchema
  .omit({ channelId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one contact field is required',
  })
const deleteContactSchema = z.object({
  confirmation: z.string().trim().min(1).max(500),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}

interface ContactCursor {
  id: number
  lastSeenAt: string
}

export interface ContactSummary {
  id: number
  channel: {
    id: number
    name: string
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

type CreateContactInput = z.infer<typeof createContactSchema>
type UpdateContactInput = z.infer<typeof updateContactSchema>

export interface ContactDeletionPreview {
  confirmationText: string
  chats: number
  messages: number
}

type ContactDeletionResult =
  | {
      status: 'deleted'
      impact: Omit<ContactDeletionPreview, 'confirmationText'>
    }
  | { status: 'confirmation_mismatch' }
  | { status: 'not_found' }

export interface ContactsRepository {
  list: (
    organizationId: string,
    query: ContactListQuery,
  ) => Promise<ContactListResult>
  get: (
    organizationId: string,
    contactId: number,
  ) => Promise<ContactDetail | undefined>
  create: (
    organizationId: string,
    input: CreateContactInput,
  ) => Promise<ContactDetail | undefined>
  update: (
    organizationId: string,
    contactId: number,
    input: UpdateContactInput,
  ) => Promise<ContactDetail | undefined>
  getDeletionPreview: (
    organizationId: string,
    contactId: number,
  ) => Promise<ContactDeletionPreview | undefined>
  delete: (
    organizationId: string,
    contactId: number,
    confirmation: string,
  ) => Promise<ContactDeletionResult>
}

export interface ContactsRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  repository?: ContactsRepository
}

const databaseRepository: ContactsRepository = {
  list: listContacts,
  get: getContact,
  create: createContact,
  update: updateContact,
  getDeletionPreview: getContactDeletionPreview,
  delete: deleteContact,
}

export const createContactsRoute = ({
  getAccess = getOrganizationAccess,
  repository = databaseRepository,
}: ContactsRouteOptions = {}) =>
  new Hono()
    .post(
      '/',
      zValidator('json', createContactSchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid contact' }, 400)
        }
      }),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageContacts(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }

        try {
          const contact = await repository.create(
            access.organizationId,
            c.req.valid('json'),
          )
          if (!contact) return c.json({ message: 'Channel not found' }, 404)
          return c.json({ contact }, 201)
        } catch (error) {
          if (getDatabaseErrorCode(error) === '23505') {
            return c.json(
              {
                message:
                  'A contact already uses this WhatsApp ID on the channel',
              },
              409,
            )
          }
          throw error
        }
      },
    )
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
    .get('/:id/deletion-impact', async (c) => {
      const contactId = parsePositiveSafeInteger(c.req.param('id'))
      if (!contactId) return c.json({ message: 'Invalid contact ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageContacts(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const impact = await repository.getDeletionPreview(
        access.organizationId,
        contactId,
      )
      if (!impact) return c.json({ message: 'Contact not found' }, 404)
      return c.json({ impact })
    })
    .get('/:id', async (c) => {
      const contactId = parsePositiveSafeInteger(c.req.param('id'))
      if (!contactId) return c.json({ message: 'Invalid contact ID' }, 400)

      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)

      const contact = await repository.get(access.organizationId, contactId)
      if (!contact) return c.json({ message: 'Contact not found' }, 404)
      return c.json({ contact })
    })
    .patch(
      '/:id',
      zValidator('json', updateContactSchema, (result, c) => {
        if (!result.success) return c.json({ message: 'Invalid contact' }, 400)
      }),
      async (c) => {
        const contactId = parsePositiveSafeInteger(c.req.param('id'))
        if (!contactId) return c.json({ message: 'Invalid contact ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageContacts(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const contact = await repository.update(
            access.organizationId,
            contactId,
            c.req.valid('json'),
          )
          if (!contact) return c.json({ message: 'Contact not found' }, 404)
          return c.json({ contact })
        } catch (error) {
          if (getDatabaseErrorCode(error) === '23505') {
            return c.json(
              {
                message:
                  'A contact already uses this WhatsApp ID on the channel',
              },
              409,
            )
          }
          throw error
        }
      },
    )
    .delete(
      '/:id',
      zValidator('json', deleteContactSchema, (result, c) => {
        if (!result.success) {
          return c.json({ message: 'Invalid contact deletion request' }, 400)
        }
      }),
      async (c) => {
        const contactId = parsePositiveSafeInteger(c.req.param('id'))
        if (!contactId) return c.json({ message: 'Invalid contact ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageContacts(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const result = await repository.delete(
            access.organizationId,
            contactId,
            c.req.valid('json').confirmation,
          )
          if (result.status === 'not_found') {
            return c.json({ message: 'Contact not found' }, 404)
          }
          if (result.status === 'confirmation_mismatch') {
            return c.json(
              { message: 'Contact confirmation did not match' },
              400,
            )
          }
          return c.json({ deleted: true as const, impact: result.impact })
        } catch (error) {
          if (getDatabaseErrorCode(error) === '23503') {
            return c.json(
              { message: 'Contact data could not be fully deleted' },
              409,
            )
          }
          throw error
        }
      },
    )

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
      channelName: channels.name,
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
      channelName: channels.name,
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

async function createContact(
  organizationId: string,
  input: CreateContactInput,
): Promise<ContactDetail | undefined> {
  const createdId = await db.transaction(async (transaction) => {
    const [channel] = await transaction
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.id, input.channelId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!channel) return undefined

    const [created] = await transaction
      .insert(contacts)
      .values({
        channelId: input.channelId,
        waId: input.waId,
        input: input.waId,
        profileName: input.profileName || null,
        profileUsername: input.profileUsername || null,
        rawContact: buildManagedRawContact(input),
      })
      .returning({ id: contacts.id })
    if (!created) throw new Error('Failed to create contact')
    await transaction.insert(chats).values({
      kind: 'direct',
      channelId: input.channelId,
      organizationId,
      contactId: created.id,
    })
    return created.id
  })
  return createdId ? getContact(organizationId, createdId) : undefined
}

async function updateContact(
  organizationId: string,
  contactId: number,
  input: UpdateContactInput,
): Promise<ContactDetail | undefined> {
  const [existing] = await db
    .select({
      waId: contacts.waId,
      profileName: contacts.profileName,
      profileUsername: contacts.profileUsername,
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
  if (!existing) return undefined

  const waId = input.waId ?? existing.waId
  if (!waId) return undefined
  await db
    .update(contacts)
    .set({
      ...(input.waId === undefined
        ? {}
        : { waId: input.waId, input: input.waId }),
      ...(input.profileName === undefined
        ? {}
        : { profileName: input.profileName || null }),
      ...(input.profileUsername === undefined
        ? {}
        : { profileUsername: input.profileUsername || null }),
      rawContact: buildManagedRawContact({
        waId,
        profileName: input.profileName ?? existing.profileName ?? undefined,
        profileUsername:
          input.profileUsername ?? existing.profileUsername ?? undefined,
      }),
      lastSeenAt: new Date(),
    })
    .where(eq(contacts.id, contactId))
  return getContact(organizationId, contactId)
}

function buildManagedRawContact(input: {
  waId: string
  profileName?: string
  profileUsername?: string
}) {
  return {
    input: input.waId,
    wa_id: input.waId,
    ...(input.profileName || input.profileUsername
      ? {
          profile: {
            ...(input.profileName ? { name: input.profileName } : {}),
            ...(input.profileUsername
              ? { username: input.profileUsername }
              : {}),
          },
        }
      : {}),
  }
}

async function getContactDeletionPreview(
  organizationId: string,
  contactId: number,
): Promise<ContactDeletionPreview | undefined> {
  const [contact] = await db
    .select({ waId: contacts.waId, userId: contacts.userId })
    .from(contacts)
    .innerJoin(channels, eq(contacts.channelId, channels.id))
    .where(
      and(
        eq(contacts.id, contactId),
        eq(channels.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!contact) return undefined
  const [chatTotal] = await db
    .select({ value: count() })
    .from(chats)
    .where(eq(chats.contactId, contactId))
  const contactChatIds = db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.contactId, contactId))
  const [messageTotal] = await db
    .select({ value: count() })
    .from(messages)
    .where(inArray(messages.chatId, contactChatIds))
  return {
    confirmationText: contact.waId ?? contact.userId ?? String(contactId),
    chats: chatTotal?.value ?? 0,
    messages: messageTotal?.value ?? 0,
  }
}

async function deleteContact(
  organizationId: string,
  contactId: number,
  confirmation: string,
): Promise<ContactDeletionResult> {
  return db.transaction(async (transaction) => {
    const [contact] = await transaction
      .select({ id: contacts.id, waId: contacts.waId, userId: contacts.userId })
      .from(contacts)
      .innerJoin(channels, eq(contacts.channelId, channels.id))
      .where(
        and(
          eq(contacts.id, contactId),
          eq(channels.organizationId, organizationId),
        ),
      )
      .limit(1)
      .for('update')
    if (!contact) return { status: 'not_found' as const }
    const confirmationText = contact.waId ?? contact.userId ?? String(contactId)
    if (confirmation !== confirmationText)
      return { status: 'confirmation_mismatch' as const }

    const contactChatIds = transaction
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.contactId, contactId))
    const contactMessageIds = transaction
      .select({ id: messages.id })
      .from(messages)
      .where(inArray(messages.chatId, contactChatIds))
    const [messageTotal] = await transaction
      .select({ value: count() })
      .from(messages)
      .where(inArray(messages.chatId, contactChatIds))
    const [chatTotal] = await transaction
      .select({ value: count() })
      .from(chats)
      .where(eq(chats.contactId, contactId))
    await transaction
      .delete(messageStatusEvents)
      .where(inArray(messageStatusEvents.messageId, contactMessageIds))
    await transaction
      .delete(chatEvents)
      .where(inArray(chatEvents.chatId, contactChatIds))
    await transaction
      .update(chats)
      .set({ latestMessageId: null, latestReadMessageId: null })
      .where(eq(chats.contactId, contactId))
    await transaction
      .delete(messages)
      .where(inArray(messages.chatId, contactChatIds))
    await transaction.delete(chats).where(eq(chats.contactId, contactId))
    await transaction
      .update(messages)
      .set({ contactId: null })
      .where(eq(messages.contactId, contactId))
    await transaction.delete(contacts).where(eq(contacts.id, contactId))
    return {
      status: 'deleted' as const,
      impact: {
        chats: chatTotal?.value ?? 0,
        messages: messageTotal?.value ?? 0,
      },
    }
  })
}

function toContactSummary(row: {
  id: number
  channelId: number
  channelPhoneNumber: string
  channelName: string
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
      name: row.channelName,
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

function canManageContacts(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return undefined
  return typeof error.code === 'string' ? error.code : undefined
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
