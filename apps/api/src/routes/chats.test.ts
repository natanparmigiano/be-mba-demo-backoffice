import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { messages } from '@mba-desk/db'
import { WhatsAppMessagingApiError } from '@mba-desk/wa-messaging'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  ChatMarkReadError,
  ChatHandoffError,
  createChatsRoute,
  encodeChatCursor,
  encodeTimelineCursor,
  messageTextExpression,
  messageTypeExpression,
  markChatMessageRead,
  resolveChatMediaUrl,
  timelineBoundary,
  transferChatControl,
  type ChatSummary,
  type ChatsRepository,
  type ChatTimelineItem,
} from './chats.js'
import type { ChatRealtime } from '../chat-realtime.js'

const chat: ChatSummary = {
  id: 31,
  kind: 'direct',
  handledBy: 'application',
  updatedAt: '2026-09-30T12:00:00.000Z',
  unreadMessageCount: 3,
  latestInboundMessageAt: '2026-09-30T11:59:00.000Z',
  assignedTeam: null,
  assignedUser: null,
  channel: {
    id: 4,
    name: 'Brazil support',
    waPhoneNumber: '+55 11 99999-0000',
  },
  contact: {
    id: 17,
    profileName: 'Ada Lovelace',
    profileUsername: 'ada',
    waId: '5511999990000',
    userId: null,
  },
  group: null,
  latestMessage: {
    id: 120,
    direction: 'inbound',
    messageType: 'text',
    occurredAt: '2026-09-30T11:59:00.000Z',
    preview: 'Hello',
  },
}

const timelineItem: ChatTimelineItem = {
  itemType: 'event',
  id: 42,
  occurredAt: '2026-09-30T11:58:00.000Z',
  eventType: 'handover',
  providerEventType: 'handover',
  agentName: 'Business AI',
  previousOwner: 'application',
  newOwner: 'mba',
}

const timelineMessage: ChatTimelineItem = {
  itemType: 'message',
  id: 43,
  providerMessageId: 'wamid.image',
  targetMessageId: null,
  occurredAt: '2026-09-30T11:59:00.000Z',
  direction: 'inbound',
  aiGenerated: false,
  messageType: 'image',
  interactiveType: null,
  status: 'read',
  forwarded: true,
  frequentlyForwarded: false,
  text: 'Campaign preview',
  media: {
    id: 'media-id',
    url: '/api/files/signed?signature=test',
    mimeType: 'image/jpeg',
    fileName: null,
    caption: 'Campaign preview',
    voice: null,
    animated: null,
  },
  interactiveData: null,
  contactData: null,
  locationData: null,
  buttonData: null,
  orderData: null,
  reactionData: null,
  templateName: null,
  isMarketingTemplate: null,
  templateData: null,
  systemData: null,
  editData: null,
  revokeData: null,
  sender: {
    profileName: 'Ada Lovelace',
    profileUsername: 'ada',
    waId: '5511999990000',
    userId: null,
  },
}

describe('chats route', () => {
  it('prefers a signed archived-media URL over the provider URL', async () => {
    const calls: string[] = []
    const result = await resolveChatMediaUrl(
      'whatsapp/media/archive.jpg',
      'https://provider.example.com/temporary',
      {
        signUrl: async (key, options) => {
          calls.push(`${options.operation}:${key}`)
          return '/api/files/signed?signature=test'
        },
      },
    )

    assert.equal(result, '/api/files/signed?signature=test')
    assert.deepEqual(calls, ['download:whatsapp/media/archive.jpg'])
  })

  it('encodes timeline cursor dates with the timestamp column driver', () => {
    const occurredAt = '2026-09-30T13:59:50.000Z'
    const query = new PgDialect().sqlToQuery(
      timelineBoundary(messages.occurredAt, messages.id, 'message', {
        id: 1_756,
        itemType: 'message',
        occurredAt,
      }),
    )

    assert.deepEqual(query.params, [occurredAt, occurredAt, 1_756])
  })

  it('prefers projected text and supports nested standby echoes', () => {
    const query = new PgDialect().sqlToQuery(messageTextExpression(10_000))

    assert.match(query.sql, /text_content/)
    assert.match(query.sql, /message,text,body/)
  })

  it('recovers missing projected message types from preserved payloads', () => {
    const query = new PgDialect().sqlToQuery(messageTypeExpression())

    assert.match(query.sql, /message_type/)
    assert.match(query.sql, /message,type/)
    assert.deepEqual(query.params, [])
  })

  it('lists organization chats with parsed pagination and filters', async () => {
    let receivedOrganizationId: string | undefined
    let receivedQuery: Parameters<ChatsRepository['list']>[1] | undefined
    const cursor = encodeChatCursor({ id: chat.id, updatedAt: chat.updatedAt })
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one', userId: 'user-1' }),
      repository: createRepository({
        list: async (organizationId, query) => {
          receivedOrganizationId = organizationId
          receivedQuery = query
          return { chats: [chat], nextCursor: null }
        },
      }),
    })

    const startDate = '2026-10-01T03:00:00.000Z'
    const endDate = '2026-10-06T02:59:59.999Z'
    const response = await route.request(
      `/?limit=25&cursor=${encodeURIComponent(cursor)}&search=Ada&channelId=7&teamId=team-one&handledBy=application&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    )

    assert.equal(response.status, 200)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.deepEqual(receivedQuery, {
      cursor: { id: chat.id, updatedAt: chat.updatedAt },
      limit: 25,
      search: 'Ada',
      channelId: 7,
      teamId: 'team-one',
      handledBy: 'application',
      startDate,
      endDate,
    })
    assert.deepEqual(await response.json(), {
      chats: [chat],
      nextCursor: null,
    })
  })

  it('returns one organization-scoped chat independently of pagination', async () => {
    let receivedOrganizationId: string | undefined
    let receivedChatId: number | undefined
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({
        get: async (organizationId, chatId) => {
          receivedOrganizationId = organizationId
          receivedChatId = chatId
          return chat
        },
      }),
    })

    const response = await route.request('/31')

    assert.equal(response.status, 200)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.equal(receivedChatId, 31)
    assert.deepEqual(await response.json(), { chat })
  })

  it('lists approved templates for the chat WABA with cursor pagination', async () => {
    let receivedContext: unknown
    let receivedQuery: unknown
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      listTemplates: async (context, query) => {
        receivedContext = context
        receivedQuery = query
        return {
          data: [
            {
              id: 'template-1',
              name: 'order_ready',
              language: 'pt_BR',
              status: 'APPROVED',
              category: 'UTILITY',
              parameter_format: 'NAMED',
              components: [
                {
                  type: 'BODY',
                  text: 'Olá, {{customer_name}}. Seu pedido está pronto.',
                  example: {
                    body_text_named_params: [
                      { param_name: 'customer_name', example: 'Ada' },
                    ],
                  },
                },
              ],
            },
          ],
          paging: {
            cursors: { after: 'next-page' },
            next: 'https://graph.facebook.com/next',
          },
        }
      },
      repository: createRepository(),
    })

    const response = await route.request('/31/templates?limit=50&after=cursor')

    assert.equal(response.status, 200)
    assert.deepEqual(receivedContext, templateContext)
    assert.deepEqual(receivedQuery, { after: 'cursor', limit: 50 })
    assert.deepEqual(await response.json(), {
      templates: [
        {
          id: 'template-1',
          name: 'order_ready',
          language: 'pt_BR',
          category: 'UTILITY',
          parameterFormat: 'NAMED',
          components: [
            {
              type: 'BODY',
              text: 'Olá, {{customer_name}}. Seu pedido está pronto.',
              example: {
                body_text_named_params: [
                  { param_name: 'customer_name', example: 'Ada' },
                ],
              },
            },
          ],
        },
      ],
      nextCursor: 'next-page',
    })
  })

  it('does not expose templates for a chat outside the organization', async () => {
    let listed = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      listTemplates: async () => {
        listed = true
        return { data: [] }
      },
      repository: createRepository({
        getTemplateContext: async () => undefined,
      }),
    })

    const response = await route.request('/31/templates')

    assert.equal(response.status, 404)
    assert.equal(listed, false)
  })

  it('returns an interleaved timeline with a parsed keyset cursor', async () => {
    let receivedChatId: number | undefined
    let receivedQuery: Parameters<ChatsRepository['timeline']>[2] | undefined
    const cursor = encodeTimelineCursor({
      id: timelineItem.id,
      itemType: timelineItem.itemType,
      occurredAt: timelineItem.occurredAt,
    })
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-two' }),
      repository: createRepository({
        timeline: async (_organizationId, chatId, query) => {
          receivedChatId = chatId
          receivedQuery = query
          return { items: [timelineItem, timelineMessage], nextCursor: null }
        },
      }),
    })

    const response = await route.request(
      `/31/timeline?limit=60&cursor=${encodeURIComponent(cursor)}`,
    )

    assert.equal(response.status, 200)
    assert.equal(receivedChatId, 31)
    assert.deepEqual(receivedQuery, {
      cursor: {
        id: timelineItem.id,
        itemType: timelineItem.itemType,
        occurredAt: timelineItem.occurredAt,
      },
      limit: 60,
    })
    assert.deepEqual(await response.json(), {
      items: [timelineItem, timelineMessage],
      nextCursor: null,
    })
  })

  it('streams exact-chat PubSub updates over SSE', async () => {
    let subscribedChannel: string | undefined
    let handler: Parameters<ChatRealtime['subscribe']>[1] | undefined
    let unsubscribeCalls = 0
    const realtime = createRealtime({
      subscribe: async (channel, nextHandler) => {
        subscribedChannel = channel
        handler = nextHandler
        return async () => {
          unsubscribeCalls += 1
        }
      },
    })
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      realtime,
      repository: createRepository(),
    })
    const controller = new AbortController()
    const response = await route.request('/31/events', {
      signal: controller.signal,
    })

    assert.equal(response.status, 200)
    assert.match(
      response.headers.get('content-type') ?? '',
      /text\/event-stream/,
    )
    assert.equal(response.headers.get('x-accel-buffering'), 'no')
    assert.equal(subscribedChannel, 'chats.31')

    const reader = response.body!.getReader()
    const ready = await readSseUntil(reader, 'event: ready')
    assert.match(ready, /data: {"chatId":31}/)

    await handler?.({
      channel: 'chats.31',
      value: JSON.stringify({
        schemaVersion: 1,
        chatId: 31,
        type: 'message.created',
        occurredAt: '2026-09-30T22:30:00.000Z',
      }),
    })
    const update = await readSseUntil(reader, 'event: chat-update')
    assert.match(update, /"type":"message.created"/)

    controller.abort()
    await reader.cancel()
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(unsubscribeCalls, 1)
  })

  it('streams organization-topic updates to the inbox', async () => {
    let subscribedChannel: string | undefined
    let handler: Parameters<ChatRealtime['subscribe']>[1] | undefined
    const realtime = createRealtime({
      subscribe: async (channel, nextHandler) => {
        subscribedChannel = channel
        handler = nextHandler
        return async () => undefined
      },
    })
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      realtime,
      repository: createRepository({
        owns: async (organizationId, chatId) =>
          organizationId === 'org-one' && chatId === 31,
      }),
    })
    const controller = new AbortController()
    const response = await route.request('/events', {
      signal: controller.signal,
    })

    assert.equal(response.status, 200)
    assert.equal(subscribedChannel, 'organizations.org-one.chats')
    const reader = response.body!.getReader()
    const ready = await readSseUntil(reader, 'event: ready')
    assert.match(ready, /"organizationId":"org-one"/)

    await handler?.({
      channel: 'organizations.org-one.chats',
      value: JSON.stringify({
        schemaVersion: 1,
        chatId: 31,
        type: 'message.created',
        occurredAt: '2026-09-30T22:31:00.000Z',
      }),
    })
    const update = await readSseUntil(reader, 'event: chat-update')
    assert.match(update, /"chatId":31/)

    controller.abort()
    await reader.cancel()
  })

  it('rejects malformed list and timeline cursors', async () => {
    let repositoryCalled = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({
        list: async () => {
          repositoryCalled = true
          return { chats: [], nextCursor: null }
        },
        timeline: async () => {
          repositoryCalled = true
          return { items: [], nextCursor: null }
        },
      }),
    })

    const listResponse = await route.request('/?cursor=invalid')
    const timelineResponse = await route.request('/31/timeline?cursor=invalid')

    assert.equal(listResponse.status, 400)
    assert.equal(timelineResponse.status, 400)
    assert.equal(repositoryCalled, false)
  })

  it('requires active organization access', async () => {
    const route = createChatsRoute({
      getAccess: async () => undefined,
      repository: createRepository(),
    })

    assert.equal((await route.request('/')).status, 401)
    assert.equal((await route.request('/31')).status, 401)
    assert.equal((await route.request('/31/timeline')).status, 401)
    assert.equal((await route.request('/31/events')).status, 401)
    assert.equal(
      (await route.request('/31/read', { method: 'PATCH' })).status,
      401,
    )
    assert.equal(
      (
        await route.request('/31/handoff', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ handledBy: 'mba' }),
        })
      ).status,
      401,
    )
  })

  it('does not expose a chat outside the active organization', async () => {
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({
        get: async () => undefined,
        getHandoffContext: async () => undefined,
        getReadContext: async () => undefined,
        markRead: async () => false,
        owns: async () => false,
        timeline: async () => undefined,
      }),
    })

    const detailResponse = await route.request('/31')
    const response = await route.request('/31/timeline')
    const readResponse = await route.request('/31/read', { method: 'PATCH' })
    const handoffResponse = await route.request('/31/handoff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handledBy: 'mba' }),
    })
    const eventsResponse = await route.request('/31/events')

    assert.equal(detailResponse.status, 404)
    assert.deepEqual(await detailResponse.json(), { message: 'Chat not found' })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Chat not found' })
    assert.equal(readResponse.status, 404)
    assert.equal(handoffResponse.status, 404)
    assert.equal(eventsResponse.status, 404)
  })

  it('marks an organization-owned chat as read', async () => {
    let markedChatId: number | undefined
    let providerMessageId: string | undefined
    const calls: string[] = []
    const published: Array<{ channel: string; value: string }> = []
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      markProviderRead: async (context) => {
        calls.push('provider')
        providerMessageId = context.messageId ?? undefined
      },
      realtime: createRealtime({
        publish: async (channel, value) => {
          published.push({ channel, value })
        },
      }),
      repository: createRepository({
        markRead: async (_organizationId, chatId) => {
          calls.push('database')
          markedChatId = chatId
          return true
        },
      }),
    })

    const response = await route.request('/31/read', { method: 'PATCH' })

    assert.equal(response.status, 200)
    assert.equal(markedChatId, 31)
    assert.equal(providerMessageId, 'wamid.incoming')
    assert.deepEqual(calls, ['provider', 'database'])
    assert.equal(published[0]?.channel, 'chats.31')
    assert.equal(published[1]?.channel, 'organizations.org-one.chats')
    assert.match(published[0]?.value ?? '', /"type":"message.status.updated"/)
    assert.deepEqual(await response.json(), { read: true })
  })

  it('sends and persists a human-owned text message', async () => {
    const published: Array<{ channel: string; value: string }> = []
    let sentTo: string | undefined
    let persistedClientMessageId: string | undefined
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      sendMessage: async (_context, message) => {
        sentTo = message.to
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: message.to, wa_id: message.to }],
          messages: [{ id: 'wamid.outbound' }],
        }
      },
      persistMessage: async (input) => {
        persistedClientMessageId = input.clientMessageId
        assert.equal(input.message.to, sendContext.recipient)
        assert.equal(input.message.type, 'text')
        return {
          chatId: 31,
          id: 99,
          providerMessageId: 'wamid.outbound',
        }
      },
      realtime: createRealtime({
        publish: async (channel, value) => {
          published.push({ channel, value })
        },
      }),
      repository: createRepository(),
    })

    const response = await route.request('/31/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientMessageId: 'ec73ed89-ecb8-49c2-aefe-0a54f87e68c3',
        message: {
          messaging_product: 'whatsapp',
          to: 'client-value-is-overridden',
          type: 'text',
          text: { body: 'Hello from the composer' },
        },
      }),
    })

    assert.equal(response.status, 201)
    assert.equal(sentTo, sendContext.recipient)
    assert.equal(
      persistedClientMessageId,
      'ec73ed89-ecb8-49c2-aefe-0a54f87e68c3',
    )
    assert.equal(published[0]?.channel, 'chats.31')
    assert.equal(published[1]?.channel, 'organizations.org-one.chats')
  })

  it('returns and logs Meta template-send failure details', async () => {
    const logged: unknown[][] = []
    const originalConsoleError = console.error
    console.error = (...values: unknown[]) => logged.push(values)
    try {
      const route = createChatsRoute({
        getAccess: async () => ({ organizationId: 'org-one' }),
        sendMessage: async () => {
          throw new WhatsAppMessagingApiError(400, {
            error: {
              message: 'Template parameter count does not match',
              code: 132000,
              error_subcode: 2494073,
              type: 'OAuthException',
              fbtrace_id: 'template-trace-id',
            },
          })
        },
        repository: createRepository(),
      })

      const response = await route.request('/31/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientMessageId: 'ec73ed89-ecb8-49c2-aefe-0a54f87e68c3',
          message: {
            messaging_product: 'whatsapp',
            to: 'client-value-is-overridden',
            type: 'template',
            template: {
              name: 'order_update',
              language: { code: 'en_US' },
            },
          },
        }),
      })

      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), {
        message:
          'Meta rejected the message: Template parameter count does not match',
        providerStatus: 400,
        providerCode: 132000,
        providerSubcode: 2494073,
        providerTraceId: 'template-trace-id',
      })
      assert.equal(JSON.stringify(logged).includes('template-trace-id'), true)
      assert.equal(JSON.stringify(logged).includes('test-token'), false)
    } finally {
      console.error = originalConsoleError
    }
  })

  it('rejects composer sends while AI owns the conversation', async () => {
    let sent = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      sendMessage: async () => {
        sent = true
        throw new Error('should not send')
      },
      repository: createRepository({
        getSendContext: async () => ({
          ...sendContext,
          handledBy: 'mba',
        }),
      }),
    })

    const response = await route.request('/31/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientMessageId: 'ec73ed89-ecb8-49c2-aefe-0a54f87e68c3',
        message: {
          messaging_product: 'whatsapp',
          to: '',
          type: 'text',
          text: { body: 'Hello' },
        },
      }),
    })

    assert.equal(response.status, 409)
    assert.equal(sent, false)
  })

  it('rejects voice messages that are not OGG audio', async () => {
    let sent = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      sendMessage: async () => {
        sent = true
        throw new Error('should not send')
      },
      repository: createRepository(),
    })

    const response = await route.request('/31/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientMessageId: 'ec73ed89-ecb8-49c2-aefe-0a54f87e68c3',
        mediaFilePath: 'chat-composer/test/message.m4a',
        mediaMimeType: 'audio/mp4',
        message: {
          messaging_product: 'whatsapp',
          to: '',
          type: 'audio',
          audio: { id: 'media-id', voice: true },
        },
      }),
    })

    assert.equal(response.status, 400)
    assert.equal(sent, false)
    assert.deepEqual(await response.json(), {
      message: 'Voice messages must use OGG audio',
    })
  })

  it('addresses group conversations as group recipients', async () => {
    let recipientType: string | undefined
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      sendMessage: async (_context, message) => {
        recipientType = message.recipient_type
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: message.to, wa_id: message.to }],
          messages: [{ id: 'wamid.group-outbound' }],
        }
      },
      persistMessage: async () => ({
        chatId: 31,
        id: 100,
        providerMessageId: 'wamid.group-outbound',
      }),
      repository: createRepository({
        getSendContext: async () => ({
          ...sendContext,
          kind: 'group',
          recipient: 'group-id',
        }),
      }),
    })

    const response = await route.request('/31/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientMessageId: 'ec73ed89-ecb8-49c2-aefe-0a54f87e68c3',
        message: {
          messaging_product: 'whatsapp',
          to: '',
          type: 'text',
          text: { body: 'Hello group' },
        },
      }),
    })

    assert.equal(response.status, 201)
    assert.equal(recipientType, 'group')
  })

  it('stages media with a presigned URL and uploads it through wa-media', async () => {
    let uploadedKind: string | undefined
    const files = new Map<string, Uint8Array>()
    const route = createChatsRoute({
      fileStore: {
        get: async (key) => {
          const body = files.get(key)
          return body
            ? { body, contentType: 'image/png', size: body.byteLength }
            : null
        },
        signUrl: async (key) => `https://files.example.test/${key}`,
      },
      getAccess: async () => ({ organizationId: 'org-one' }),
      uploadMedia: async (_context, input) => {
        uploadedKind = input.kind
        return { id: 'meta-media-id' }
      },
      repository: createRepository(),
    })

    const signedResponse = await route.request('/31/media-upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'image',
        fileName: 'photo.png',
        contentType: 'image/png',
        size: 4,
      }),
    })
    assert.equal(signedResponse.status, 200)
    const signed = (await signedResponse.json()) as {
      result: { key: string; uploadUrl: string }
    }
    files.set(signed.result.key, new Uint8Array([1, 2, 3, 4]))

    const completeResponse = await route.request('/31/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'image',
        fileName: 'photo.png',
        contentType: 'image/png',
        size: 4,
        key: signed.result.key,
      }),
    })

    assert.equal(completeResponse.status, 200)
    assert.equal(uploadedKind, 'image')
    assert.match(signed.result.uploadUrl, /chat-composer/)
    assert.deepEqual(await completeResponse.json(), {
      result: {
        id: 'meta-media-id',
        key: signed.result.key,
        contentType: 'image/png',
        fileName: 'photo.png',
      },
    })
  })

  it('does not move the local cursor when Meta rejects mark-as-read', async () => {
    let markedLocally = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      markProviderRead: async () => {
        throw new ChatMarkReadError('Meta rejected the mark-as-read request')
      },
      repository: createRepository({
        markRead: async () => {
          markedLocally = true
          return true
        },
      }),
    })

    const response = await route.request('/31/read', { method: 'PATCH' })

    assert.equal(response.status, 502)
    assert.equal(markedLocally, false)
    assert.deepEqual(await response.json(), {
      message: 'Meta rejected the mark-as-read request',
    })
  })

  it('skips Meta when a chat has no inbound provider message', async () => {
    let providerCalled = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      markProviderRead: async () => {
        providerCalled = true
      },
      repository: createRepository({
        getReadContext: async () => ({ ...readContext, messageId: null }),
      }),
    })

    const response = await route.request('/31/read', { method: 'PATCH' })

    assert.equal(response.status, 200)
    assert.equal(providerCalled, false)
  })

  it('hands an organization-owned chat to the requested owner', async () => {
    let serviceTarget: 'mba' | 'application' | undefined
    let storedTarget: 'mba' | 'application' | undefined
    const published: Array<{ channel: string; value: string }> = []
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one', userId: 'user-1' }),
      handoff: async (_context, handledBy) => {
        serviceTarget = handledBy
      },
      realtime: createRealtime({
        publish: async (channel, value) => {
          published.push({ channel, value })
        },
      }),
      repository: createRepository({
        getHandoffContext: async () => handoffContext,
        setHandler: async (organizationId, chatId, handledBy, userId) => {
          assert.equal(organizationId, 'org-one')
          assert.equal(chatId, 31)
          assert.equal(userId, 'user-1')
          storedTarget = handledBy
          return true
        },
      }),
    })

    const response = await route.request('/31/handoff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handledBy: 'mba' }),
    })

    assert.equal(response.status, 200)
    assert.equal(serviceTarget, 'mba')
    assert.equal(storedTarget, 'mba')
    assert.deepEqual(await response.json(), { handledBy: 'mba' })
    assert.equal(published[0]?.channel, 'chats.31')
    assert.equal(published[1]?.channel, 'organizations.org-one.chats')
    assert.match(published[0]?.value ?? '', /"type":"conversation.updated"/)
  })

  it('assigns a chat to the current organization user', async () => {
    let assignment:
      | {
          organizationId: string
          chatId: number
          userId: string
          force: boolean
        }
      | undefined
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one', userId: 'user-1' }),
      repository: createRepository({
        assignToUser: async (organizationId, chatId, userId, force) => {
          assignment = { organizationId, chatId, userId, force }
          return 'ok'
        },
      }),
    })

    const response = await route.request('/31/assignment', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'assign' }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(assignment, {
      organizationId: 'org-one',
      chatId: 31,
      userId: 'user-1',
      force: false,
    })
  })

  it('requires confirmation before replacing another user assignment', async () => {
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one', userId: 'user-1' }),
      repository: createRepository({
        assignToUser: async () => 'conflict',
      }),
    })

    const response = await route.request('/31/assignment', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'assign' }),
    })

    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      message: 'Chat is assigned to another user',
      conflict: true,
    })
  })

  it('only releases the current user assignment', async () => {
    let releasedUserId: string | undefined
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one', userId: 'user-1' }),
      repository: createRepository({
        releaseAssignment: async (_organizationId, _chatId, userId) => {
          releasedUserId = userId
          return 'ok'
        },
      }),
    })

    const response = await route.request('/31/assignment', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'release' }),
    })

    assert.equal(response.status, 200)
    assert.equal(releasedUserId, 'user-1')
  })

  it('treats an already-owned chat as an idempotent handoff', async () => {
    let serviceCalled = false
    let repositoryUpdated = false
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      handoff: async () => {
        serviceCalled = true
      },
      repository: createRepository({
        getHandoffContext: async () => ({
          ...handoffContext,
          handledBy: 'mba',
        }),
        setHandler: async () => {
          repositoryUpdated = true
          return true
        },
      }),
    })

    const response = await route.request('/31/handoff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handledBy: 'mba' }),
    })

    assert.equal(response.status, 200)
    assert.equal(serviceCalled, false)
    assert.equal(repositoryUpdated, false)
  })

  it('rejects handoff without a recipient or valid target', async () => {
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({
        getHandoffContext: async () => ({
          ...handoffContext,
          recipient: null,
        }),
      }),
    })

    const missingRecipient = await route.request('/31/handoff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handledBy: 'mba' }),
    })
    const invalidTarget = await route.request('/31/handoff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handledBy: 'operator' }),
    })

    assert.equal(missingRecipient.status, 409)
    assert.equal(invalidTarget.status, 400)
  })

  it('returns a stable error when Meta rejects the handoff', async () => {
    const route = createChatsRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      handoff: async () => {
        throw new ChatHandoffError(
          'Meta rejected the conversation handoff',
          409,
        )
      },
      repository: createRepository({
        getHandoffContext: async () => handoffContext,
      }),
    })

    const response = await route.request('/31/handoff', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handledBy: 'mba' }),
    })

    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      message: 'Meta rejected the conversation handoff',
    })
  })

  it('maps human and AI ownership to Meta thread-control actions', async () => {
    const requests: Request[] = []
    const request: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({ messaging_product: 'whatsapp' })
    }

    await transferChatControl(handoffContext, 'application', request)
    await transferChatControl(handoffContext, 'mba', request)

    assert.deepEqual(await requests[0]?.json(), {
      messaging_product: 'whatsapp',
      action: 'take',
      to: handoffContext.recipient,
    })
    assert.deepEqual(await requests[1]?.json(), {
      messaging_product: 'whatsapp',
      action: 'release',
      to: handoffContext.recipient,
    })
    assert.match(requests[0]?.url ?? '', /thread_control$/)
  })

  it('marks the resolved provider message read through wa-messaging', async () => {
    const requests: Request[] = []
    const request: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({ success: true })
    }

    await markChatMessageRead(readContext, request)

    assert.match(requests[0]?.url ?? '', /phone-number-id\/messages$/)
    assert.deepEqual(await requests[0]?.json(), {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.incoming',
    })
  })
})

const handoffContext = {
  handledBy: 'application' as const,
  recipient: '5511999990000',
  waPhoneNumberId: 'phone-number-id',
  waSystemUserAccessToken: 'secret-token',
}

const readContext = {
  messageId: 'wamid.incoming',
  waPhoneNumberId: 'phone-number-id',
  waSystemUserAccessToken: 'secret-token',
}

const sendContext = {
  accessToken: 'secret-token',
  contactId: 17,
  handledBy: 'application' as const,
  kind: 'direct' as const,
  organizationId: 'org-one',
  phoneNumberId: 'phone-number-id',
  recipient: '5511999990000',
}

const templateContext = {
  accessToken: 'secret-token',
  wabaId: 'waba-id',
}

function createRepository(
  overrides: Partial<ChatsRepository> = {},
): ChatsRepository {
  return {
    assignToUser: async () => 'ok',
    get: async () => chat,
    getHandoffContext: async () => handoffContext,
    list: async () => ({ chats: [], nextCursor: null }),
    markRead: async () => true,
    owns: async () => true,
    releaseAssignment: async () => 'ok',
    setHandler: async () => true,
    timeline: async () => ({ items: [], nextCursor: null }),
    ...overrides,
    getReadContext: overrides.getReadContext ?? (async () => readContext),
    getSendContext: overrides.getSendContext ?? (async () => sendContext),
    getTemplateContext:
      overrides.getTemplateContext ?? (async () => templateContext),
  }
}

function createRealtime(overrides: Partial<ChatRealtime> = {}): ChatRealtime {
  return {
    publish: async () => undefined,
    start: async () => undefined,
    subscribe: async () => async () => undefined,
    ...overrides,
  }
}

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
): Promise<string> {
  const decoder = new TextDecoder()
  let value = ''
  while (!value.includes(expected)) {
    const chunk = await reader.read()
    if (chunk.done) throw new Error(`SSE ended before ${expected}`)
    value += decoder.decode(chunk.value, { stream: true })
  }
  return value
}
