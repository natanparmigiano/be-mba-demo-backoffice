import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppMessagingClient,
  whatsappOutboundMessageSchema,
  WhatsAppMessagingApiError,
  WhatsAppMessagingResponseError,
} from './index.js'
import type { Fetch, SendMessageInput } from './index.js'

const successBody = {
  messaging_product: 'whatsapp',
  contacts: [{ input: '5511999999999', wa_id: '5511999999999' }],
  messages: [{ id: 'wamid.message-id' }],
}

function recordingFetch(
  response = new Response(JSON.stringify(successBody), { status: 200 }),
) {
  const requests: Array<{ input: string | URL | Request; init?: RequestInit }> =
    []
  const fetch: Fetch = (input, init) => {
    requests.push({ input, init })
    return Promise.resolve(response.clone())
  }
  return { fetch, requests }
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

function requestJson(init: RequestInit | undefined): unknown {
  const body = init?.body
  if (typeof body !== 'string') {
    throw new TypeError('Expected a string request body')
  }
  return JSON.parse(body) as unknown
}

describe('WhatsAppMessagingClient', () => {
  it('validates the specialized request shapes exposed by the public types', () => {
    const messages: SendMessageInput[] = [
      {
        to: '1',
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: 'Open the site' },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: 'Open',
              url: 'https://example.com',
            },
          },
        },
      },
      {
        to: '1',
        type: 'template',
        template: {
          name: 'offer',
          language: { code: 'en_US' },
          components: [
            {
              type: 'button',
              sub_type: 'copy_code',
              index: 0,
              parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }],
            },
          ],
        },
      },
      {
        to: '1',
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: { text: 'Share your location' },
          action: { name: 'send_location' },
        },
      },
      {
        to: '1',
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: 'Start' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_action: 'navigate',
              flow_token: 'token',
              flow_id: 'flow-id',
              flow_cta: 'Start',
              mode: 'published',
            },
          },
        },
      },
    ]

    for (const message of messages) {
      assert.equal(
        whatsappOutboundMessageSchema.safeParse({
          messaging_product: 'whatsapp',
          ...message,
        }).success,
        true,
      )
    }
  })

  it('sends every supported message type through the messages endpoint', async () => {
    const { fetch, requests } = recordingFetch()
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: 'phone/id',
      graphApiVersion: 'v26.0',
      fetch,
    })
    const messages: SendMessageInput[] = [
      { to: '1', type: 'audio', audio: { id: 'audio-id', voice: true } },
      {
        to: '1',
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: 'Ada Lovelace',
              first_name: 'Ada',
              last_name: 'Lovelace',
            },
          },
        ],
      },
      {
        to: '1',
        type: 'document',
        document: {
          link: 'https://example.test/file.pdf',
          filename: 'file.pdf',
        },
      },
      { to: '1', type: 'image', image: { id: 'image-id' } },
      {
        to: '1',
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose' },
          action: {
            buttons: [{ type: 'reply', reply: { id: 'yes', title: 'Yes' } }],
          },
        },
      },
      {
        to: '1',
        type: 'location',
        location: { latitude: -23.55, longitude: -46.63 },
      },
      {
        to: '1',
        type: 'reaction',
        reaction: { message_id: 'wamid.original', emoji: '👍' },
      },
      { to: '1', type: 'sticker', sticker: { id: 'sticker-id' } },
      {
        to: '1',
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      },
      {
        to: '1',
        type: 'text',
        text: { body: 'Hello', preview_url: false },
      },
      { to: '1', type: 'video', video: { id: 'video-id' } },
    ]

    for (const message of messages) {
      await client.send(message)
    }

    assert.equal(requests.length, messages.length)
    requests.forEach((request, index) => {
      assert.equal(
        requestUrl(request.input),
        'https://graph.facebook.com/v26.0/phone%2Fid/messages',
      )
      assert.equal(request.init?.method, 'POST')
      assert.deepEqual(request.init?.headers, {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      })
      assert.deepEqual(requestJson(request.init), {
        messaging_product: 'whatsapp',
        ...messages[index],
      })
    })
  })

  it('requires a structured name field for outbound contacts', () => {
    const result = whatsappOutboundMessageSchema.safeParse({
      messaging_product: 'whatsapp',
      to: '1',
      type: 'contacts',
      contacts: [{ name: { formatted_name: 'Ada Lovelace' } }],
    })

    assert.equal(result.success, false)
  })

  it('builds a typed template request with components', async () => {
    const { fetch, requests } = recordingFetch()
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch,
    })

    const result = await client.sendTemplate({
      to: '5511999999999',
      template: {
        name: 'order_update',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'customer', text: 'Ada' },
              {
                type: 'currency',
                currency: {
                  fallback_value: 'R$ 10,00',
                  code: 'BRL',
                  amount_1000: 10000,
                },
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [{ type: 'payload', payload: 'confirm' }],
          },
        ],
      },
    })

    assert.equal(result.messages[0]?.id, 'wamid.message-id')
    assert.equal(
      requests[0] ? requestUrl(requests[0].input) : undefined,
      'http://graph.test/custom/v26.0/123/messages',
    )
    assert.deepEqual(requestJson(requests[0]?.init), {
      messaging_product: 'whatsapp',
      to: '5511999999999',
      type: 'template',
      template: {
        name: 'order_update',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'customer', text: 'Ada' },
              {
                type: 'currency',
                currency: {
                  fallback_value: 'R$ 10,00',
                  code: 'BRL',
                  amount_1000: 10000,
                },
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [{ type: 'payload', payload: 'confirm' }],
          },
        ],
      },
    })
  })

  it('forwards abort signals', async () => {
    const { fetch, requests } = recordingFetch()
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })
    const controller = new AbortController()

    await client.sendText(
      { to: '1', text: { body: 'Hello' } },
      { signal: controller.signal },
    )

    assert.equal(requests[0]?.init?.signal, controller.signal)
  })

  it('sends to group recipients explicitly', async () => {
    const { fetch, requests } = recordingFetch()
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })

    await client.sendText({
      to: 'group-id',
      recipient_type: 'group',
      text: { body: 'Hello group' },
    })

    assert.deepEqual(requestJson(requests[0]?.init), {
      messaging_product: 'whatsapp',
      recipient_type: 'group',
      to: 'group-id',
      type: 'text',
      text: { body: 'Hello group' },
    })
  })

  it('sends contextual replies and enables link previews', async () => {
    const { fetch, requests } = recordingFetch()
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })

    await client.sendImage({
      to: '5511999999999',
      context: { message_id: 'wamid.original' },
      image: { id: 'image-id' },
    })
    await client.sendText({
      to: '5511999999999',
      text: {
        body: 'Visit https://www.meta.com/',
        preview_url: true,
      },
    })

    assert.deepEqual(requestJson(requests[0]?.init), {
      messaging_product: 'whatsapp',
      to: '5511999999999',
      context: { message_id: 'wamid.original' },
      type: 'image',
      image: { id: 'image-id' },
    })
    assert.deepEqual(requestJson(requests[1]?.init), {
      messaging_product: 'whatsapp',
      to: '5511999999999',
      type: 'text',
      text: {
        body: 'Visit https://www.meta.com/',
        preview_url: true,
      },
    })
  })

  it('marks messages read and shows typing indicators', async () => {
    const { fetch, requests } = recordingFetch(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })

    assert.deepEqual(await client.markAsRead('wamid.incoming'), {
      success: true,
    })
    assert.deepEqual(await client.showTypingIndicator('wamid.incoming'), {
      success: true,
    })
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.deepEqual(requestJson(requests[0]?.init), {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.incoming',
    })
    assert.equal(requests[1]?.init?.method, 'POST')
    assert.deepEqual(requestJson(requests[1]?.init), {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.incoming',
      typing_indicator: { type: 'text' },
    })
  })

  it('surfaces structured Graph API errors', async () => {
    const { fetch } = recordingFetch(
      new Response(
        JSON.stringify({
          error: {
            message: 'Invalid parameter',
            type: 'OAuthException',
            code: 100,
            error_subcode: 2494010,
            fbtrace_id: 'trace-id',
          },
        }),
        { status: 400 },
      ),
    )
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })

    await assert.rejects(
      client.sendText({ to: '1', text: { body: 'Hello' } }),
      (error: unknown) => {
        assert.ok(error instanceof WhatsAppMessagingApiError)
        assert.equal(error.message, 'Invalid parameter')
        assert.equal(error.status, 400)
        assert.equal(error.code, 100)
        assert.equal(error.subcode, 2494010)
        assert.equal(error.errorType, 'OAuthException')
        assert.equal(error.traceId, 'trace-id')
        return true
      },
    )
  })

  it('rejects malformed successful responses', async () => {
    const { fetch } = recordingFetch(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    )
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })

    await assert.rejects(
      client.sendText({ to: '1', text: { body: 'Hello' } }),
      WhatsAppMessagingResponseError,
    )
  })

  it('rejects malformed message-action responses', async () => {
    const { fetch } = recordingFetch(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    )
    const client = createWhatsAppMessagingClient({
      accessToken: 'test-token',
      phoneNumberId: '123',
      fetch,
    })

    await assert.rejects(
      client.markAsRead('wamid.incoming'),
      WhatsAppMessagingResponseError,
    )
  })

  it('validates client configuration without making a request', () => {
    assert.throws(
      () =>
        createWhatsAppMessagingClient({
          accessToken: '',
          phoneNumberId: '123',
        }),
      /accessToken must not be empty/,
    )
    assert.throws(
      () =>
        createWhatsAppMessagingClient({
          accessToken: 'token',
          phoneNumberId: '123',
          graphApiVersion: '26',
        }),
      /graphApiVersion must use the form v26\.0/,
    )
    assert.throws(
      () =>
        createWhatsAppMessagingClient({
          accessToken: 'token',
          phoneNumberId: '123',
          graphApiBaseUrl: 'file:///tmp',
        }),
      /graphApiBaseUrl must use http or https/,
    )
  })
})
