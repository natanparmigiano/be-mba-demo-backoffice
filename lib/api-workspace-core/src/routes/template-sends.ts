import { auth } from '@mba-desk/auth'
import {
  channels,
  chats,
  contacts,
  db,
  member,
  messages,
  persistWhatsAppOutboundMessage,
} from '@mba-desk/db'
import {
  createWhatsAppMarketingClient,
  WhatsAppMarketingApiError,
  WhatsAppMarketingResponseError,
} from '@mba-desk/wa-marketing'
import {
  createWhatsAppMessagingClient,
  whatsappOutboundMessageSchema,
  whatsappSendMessageResponseSchema,
  WhatsAppMessagingApiError,
  WhatsAppMessagingResponseError,
  type SendMessageInput,
} from '@mba-desk/wa-messaging'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, ilike, isNotNull, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

const listSchema = z.object({
  channelId: z.coerce.number().int().positive().safe(),
  limit: z.coerce.number().int().positive().max(100).default(24),
  cursor: z.string().trim().min(1).max(500).optional(),
  templateName: z.string().trim().max(512).optional(),
  recipient: z.string().trim().max(64).optional(),
  api: z.enum(['messages', 'marketing']).optional(),
  status: z
    .enum([
      'accepted',
      'deleted',
      'delivered',
      'failed',
      'played',
      'queued',
      'read',
      'sending',
      'sent',
      'unknown',
    ])
    .optional(),
})
const cursorSchema = z.object({ id: z.number().int().positive().safe() })
const sendSchema = z.object({
  channelId: z.number().int().positive().safe(),
  clientMessageId: z.string().uuid(),
  api: z.enum(['messages', 'marketing']),
  templatePreview: z.string().trim().max(10_000).optional(),
  message: whatsappOutboundMessageSchema
    .refine(
      (message) => message.type === 'template',
      'A template message is required',
    )
    .transform((message) => message as unknown as SendMessageInput),
})

export const createTemplateSendsRoute = () =>
  new Hono()
    .get('/', zValidator('query', listSchema), async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const query = c.req.valid('query')
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
      if (query.cursor && !cursor) {
        return c.json({ message: 'Invalid template messages cursor' }, 400)
      }
      const conditions = [
        eq(chats.organizationId, access.organizationId),
        eq(chats.channelId, query.channelId),
        eq(messages.direction, 'outbound' as const),
        isNotNull(messages.templateName),
      ]
      if (cursor) conditions.push(lt(messages.id, cursor.id))
      if (query.templateName) {
        conditions.push(
          ilike(messages.templateName, `%${escapeLike(query.templateName)}%`),
        )
      }
      if (query.recipient) {
        conditions.push(
          ilike(messages.recipientId, `%${escapeLike(query.recipient)}%`),
        )
      }
      if (query.api) {
        conditions.push(
          eq(messages.isMarketingTemplate, query.api === 'marketing'),
        )
      }
      if (query.status) {
        const statusCondition = or(
          eq(messages.status, query.status as typeof messages.status._.data),
          eq(
            messages.dispatchStatus,
            query.status as typeof messages.dispatchStatus._.data,
          ),
        )
        if (statusCondition) conditions.push(statusCondition)
      }
      const rows = await db
        .select({
          id: messages.id,
          templateName: messages.templateName,
          isMarketingTemplate: messages.isMarketingTemplate,
          recipient: messages.recipientId,
          status: messages.status,
          dispatchStatus: messages.dispatchStatus,
          occurredAt: messages.occurredAt,
          language: messages.templateData,
        })
        .from(messages)
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .where(and(...conditions))
        .orderBy(desc(messages.id))
        .limit(query.limit + 1)
      const page = rows.slice(0, query.limit)
      return c.json({
        messages: page.map((row) => ({
          id: row.id,
          templateName: row.templateName!,
          isMarketingTemplate: row.isMarketingTemplate,
          recipient: row.recipient,
          status: row.status ?? row.dispatchStatus,
          occurredAt: row.occurredAt?.toISOString() ?? null,
          language: row.language?.language.code ?? null,
        })),
        nextCursor:
          rows.length > query.limit && page.at(-1)
            ? encodeCursor({ id: page.at(-1)!.id })
            : null,
      })
    })
    .post('/', zValidator('json', sendSchema), async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManage(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      const input = c.req.valid('json')
      const configuration = await getConfiguration(
        access.organizationId,
        input.channelId,
      )
      if (!configuration) return c.json({ message: 'Channel not found' }, 404)
      if (input.message.type !== 'template') {
        return c.json({ message: 'A template message is required' }, 400)
      }

      try {
        const persistedMessage = whatsappOutboundMessageSchema.parse(
          input.message,
        )
        const response =
          input.api === 'marketing'
            ? await createWhatsAppMarketingClient(configuration).send(
                {
                  to: input.message.to,
                  template: input.message.template,
                },
                { signal: AbortSignal.timeout(30_000) },
              )
            : await createWhatsAppMessagingClient(configuration).send(
                input.message,
                { signal: AbortSignal.timeout(30_000) },
              )
        const parsedResponse = whatsappSendMessageResponseSchema.parse(response)
        const contact = parsedResponse.contacts[0]
        if (!contact) throw new Error('Meta response did not include a contact')
        const chat = await ensureDirectChat(
          access.organizationId,
          input.channelId,
          contact,
        )
        const stored = await persistWhatsAppOutboundMessage({
          chatId: chat.chatId,
          contactId: chat.contactId,
          clientMessageId: input.clientMessageId,
          templatePreview: input.templatePreview,
          isMarketingTemplate: input.api === 'marketing',
          message: persistedMessage,
          response: parsedResponse,
        })
        return c.json({ message: stored }, 201)
      } catch (error) {
        if (
          error instanceof WhatsAppMessagingApiError ||
          error instanceof WhatsAppMarketingApiError
        ) {
          return c.json(
            { message: 'Meta rejected the template message' },
            error.status >= 400 && error.status < 500 ? 409 : 502,
          )
        }
        if (
          error instanceof WhatsAppMessagingResponseError ||
          error instanceof WhatsAppMarketingResponseError
        ) {
          return c.json({ message: 'Meta returned an invalid response' }, 502)
        }
        throw error
      }
    })

async function getConfiguration(organizationId: string, channelId: number) {
  const [row] = await db
    .select({
      accessToken: channels.waSystemUserAccessToken,
      phoneNumberId: channels.waPhoneNumberId,
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
}

async function ensureDirectChat(
  organizationId: string,
  channelId: number,
  contact: { input: string; wa_id: string },
) {
  return db.transaction(async (transaction) => {
    const now = new Date()
    const [storedContact] = await transaction
      .insert(contacts)
      .values({
        channelId,
        waId: contact.wa_id,
        input: contact.input,
        rawContact: contact,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [contacts.channelId, contacts.waId],
        set: { input: contact.input, rawContact: contact, lastSeenAt: now },
      })
      .returning({ id: contacts.id })
    if (!storedContact) throw new Error('Could not persist template recipient')
    let [chat] = await transaction
      .insert(chats)
      .values({
        kind: 'direct',
        channelId,
        organizationId,
        contactId: storedContact.id,
      })
      .onConflictDoNothing({ target: chats.contactId })
      .returning({ id: chats.id })
    if (!chat) {
      ;[chat] = await transaction
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.contactId, storedContact.id))
        .limit(1)
    }
    if (!chat) throw new Error('Could not resolve recipient chat')
    return { chatId: chat.id, contactId: storedContact.id }
  })
}

async function getAccess(headers: Headers) {
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
    .some((value) => ['owner', 'admin'].includes(value.trim()))
}

export function encodeCursor(cursor: { id: number }) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(value: string) {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
  } catch {
    return undefined
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}
