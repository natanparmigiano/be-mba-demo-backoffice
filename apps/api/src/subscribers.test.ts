import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EventMessage, PublishOptions } from '@mba-demo/events'
import type { WhatsAppWebhook } from '@mba-demo/wa-webhooks'
import {
  createRunnerExecutionHandler,
  createWhatsAppWebhookRetryHandler,
  createWhatsAppWebhookForwardHandler,
  createWhatsAppWebhookHandler,
  includeWhatsAppReliabilityTopics,
  WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC,
  type WhatsAppWebhookDeadLetter,
} from './subscribers.js'

describe('runner execution subscriber', () => {
  it('executes the queued database record identified by the event', async () => {
    let executionId: number | undefined
    const handler = createRunnerExecutionHandler({
      executeQueuedExecution: async (id) => {
        executionId = id
        return true
      },
    })

    await handler({
      topic: 'runner.execution.requested.v1',
      key: '42',
      headers: { 'content-type': 'application/json' },
      timestamp: Date.now(),
      value: JSON.stringify({ schemaVersion: 1, executionId: 42 }),
    })

    assert.equal(executionId, 42)
  })

  it('rejects inconsistent event keys before executing', async () => {
    const handler = createRunnerExecutionHandler({
      executeQueuedExecution: async () => {
        throw new Error('must not execute')
      },
    })

    await assert.rejects(
      async () =>
        handler({
          topic: 'runner.execution.requested.v1',
          key: '41',
          headers: {},
          timestamp: Date.now(),
          value: JSON.stringify({ schemaVersion: 1, executionId: 42 }),
        }),
      /key and payload disagree/,
    )
  })
})

interface PublishedEvent {
  options?: PublishOptions
  topic: string
  value: string
}

function publisher(events: PublishedEvent[]) {
  return {
    publish(topic: string, value: string, options?: PublishOptions) {
      events.push({ topic, value, options })
      return Promise.resolve()
    },
  }
}

const webhook: WhatsAppWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-id',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550001111',
              phone_number_id: 'phone-number-id',
            },
            contacts: [{ wa_id: '15550002222' }],
            messages: [
              {
                from: '15550002222',
                id: 'wamid.test',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'hello' },
              },
            ],
          },
        },
      ],
    },
  ],
}

const mediaWebhook: WhatsAppWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-id',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550001111',
              phone_number_id: 'phone-number-id',
            },
            messages: [
              {
                from: '15550002222',
                id: 'wamid.media',
                timestamp: '1700000000',
                type: 'image',
                image: {
                  id: 'media-id',
                  mime_type: 'image/jpeg',
                  sha256: 'provider-digest',
                },
              },
            ],
          },
        },
      ],
    },
  ],
}

const observedWebhookBodies: readonly unknown[] = [
  {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'standby',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              standby: {
                contacts: [{ wa_id: '15550002222', user_id: 'user-id' }],
                messages: [
                  {
                    from: '15550002222',
                    from_user_id: 'user-id',
                    id: 'wamid.standby-audio',
                    timestamp: '1700000000',
                    type: 'audio',
                    audio: {
                      id: 'audio-media-id',
                      mime_type: 'audio/ogg; codecs=opus',
                      sha256: 'audio-digest',
                      voice: true,
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'standby',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              standby: {
                statuses: [
                  {
                    id: 'wamid.standby-outbound',
                    status: 'delivered',
                    timestamp: '1700000001',
                    recipient_id: '15550002222',
                    recipient_user_id: 'user-id',
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'standby',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              standby: {
                message_echoes: [
                  {
                    id: 'wamid.standby-outbound',
                    timestamp: '1700000000',
                    message: {
                      to: '15550002222',
                      recipient: '15550002222',
                      recipient_type: 'individual',
                      type: 'text',
                      text: { body: 'A Business AI response' },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messaging_handovers',
            value: {
              messaging_product: 'whatsapp',
              recipient: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              sender: { phone_number: '15550002222' },
              timestamp: '1700000002',
              type: 'control_passed',
              control_passed: {
                metadata: 'handover-metadata',
                previous_owner_app_id: 'business-agent-app-id',
                previous_owner_app_role: 'meta_business_agent',
                previous_owner_role: 'ai_agent',
                new_owner_role: 'escalation',
              },
            },
          },
        ],
      },
    ],
  },
]

describe('WhatsApp webhook subscriber', () => {
  it('fans persisted chat updates out through PubSub', async () => {
    const published: Array<{ channel: string; value: string }> = []
    const handler = createWhatsAppWebhookHandler(
      async () => ({
        organizationId: 'org-one',
        chatEvents: 0,
        contacts: 1,
        groups: 0,
        messages: 1,
        statuses: 0,
        updates: [{ chatId: 31, type: 'message.created' }],
      }),
      async () => new Map(),
      {
        publish: async (channel, value) => {
          published.push({ channel, value })
        },
      },
    )

    await handler({
      topic: 'wa-cloud.webhook.v1',
      key: '42',
      headers: { 'channel-id': '42' },
      timestamp: Date.now(),
      value: JSON.stringify(webhook),
    })

    assert.equal(published.length, 2)
    assert.equal(published[0]?.channel, 'chats.31')
    assert.equal(published[1]?.channel, 'organizations.org-one.chats')
    const event = JSON.parse(published[0]?.value ?? '') as Record<
      string,
      unknown
    >
    assert.deepEqual(
      { ...event, occurredAt: undefined },
      {
        schemaVersion: 1,
        chatId: 31,
        type: 'message.created',
        occurredAt: undefined,
      },
    )
    assert.match(String(event.occurredAt), /^\d{4}-\d{2}-\d{2}T/)
  })

  it('validates the event envelope and invokes persistence', async () => {
    const calls: Array<{ channelId: number; webhook: WhatsAppWebhook }> = []
    const handler = createWhatsAppWebhookHandler(async (channelId, payload) => {
      calls.push({ channelId, webhook: payload })
      return {
        organizationId: 'org-one',
        chatEvents: 0,
        contacts: 1,
        groups: 0,
        messages: 1,
        statuses: 0,
        updates: [],
      }
    })

    await handler({
      topic: 'wa-cloud.webhook.v1',
      key: '42',
      headers: { 'channel-id': '42' },
      timestamp: Date.now(),
      value: JSON.stringify(webhook),
    })

    assert.deepEqual(calls, [{ channelId: 42, webhook }])
  })

  it('rejects inconsistent channel routing metadata', async () => {
    const handler = createWhatsAppWebhookHandler(async () => ({
      organizationId: 'org-one',
      chatEvents: 0,
      contacts: 0,
      groups: 0,
      messages: 0,
      statuses: 0,
      updates: [],
    }))

    await assert.rejects(
      async () =>
        handler({
          topic: 'wa-cloud.webhook.v1',
          key: '42',
          headers: { 'channel-id': '43' },
          timestamp: Date.now(),
          value: JSON.stringify(webhook),
        }),
      /key and channel header disagree/,
    )
  })

  it('archives media before persisting its file path', async () => {
    let persistedPaths: ReadonlyMap<string, string> | undefined
    const handler = createWhatsAppWebhookHandler(
      async (_channelId, _payload, _database, options) => {
        persistedPaths = options?.mediaFilePaths
        return {
          organizationId: 'org-one',
          chatEvents: 0,
          contacts: 1,
          groups: 0,
          messages: 1,
          statuses: 0,
          updates: [],
        }
      },
      async () =>
        new Map([['wamid.media', 'whatsapp/media/sharded/media-file.jpg']]),
    )

    await handler({
      topic: 'wa-cloud.webhook.v1',
      key: '42',
      headers: { 'channel-id': '42' },
      timestamp: Date.now(),
      value: JSON.stringify(mediaWebhook),
    })

    assert.equal(
      persistedPaths?.get('wamid.media'),
      'whatsapp/media/sharded/media-file.jpg',
    )
  })

  it('does not persist a media webhook when archiving fails', async () => {
    let ingested = false
    const handler = createWhatsAppWebhookHandler(
      async () => {
        ingested = true
        return {
          organizationId: 'org-one',
          chatEvents: 0,
          contacts: 0,
          groups: 0,
          messages: 0,
          statuses: 0,
          updates: [],
        }
      },
      async () => {
        throw new Error('media download failed')
      },
    )

    await assert.rejects(
      async () =>
        await handler({
          topic: 'wa-cloud.webhook.v1',
          key: '42',
          headers: { 'channel-id': '42' },
          timestamp: Date.now(),
          value: JSON.stringify(mediaWebhook),
        }),
      /media download failed/,
    )
    assert.equal(ingested, false)
  })

  it('accepts the standby and handover envelopes observed from Meta', async () => {
    const persisted: WhatsAppWebhook[] = []
    const handler = createWhatsAppWebhookHandler(
      async (_channelId, payload) => {
        persisted.push(payload)
        return {
          organizationId: 'org-one',
          chatEvents: 0,
          contacts: 0,
          groups: 0,
          messages: 0,
          statuses: 0,
          updates: [],
        }
      },
      async () => new Map(),
    )

    for (const body of observedWebhookBodies) {
      await handler({
        topic: 'wa-cloud.webhook.v1',
        key: '42',
        headers: { 'channel-id': '42' },
        timestamp: Date.now(),
        value: JSON.stringify(body),
      })
    }

    assert.deepEqual(
      persisted.map((payload) => payload.entry[0]?.changes[0]?.field),
      ['standby', 'standby', 'standby', 'messaging_handovers'],
    )
  })
})

describe('WhatsApp webhook retry and dead-letter handling', () => {
  it('dead-letters a poison webhook after the configured retries', async () => {
    const published: PublishedEvent[] = []
    let attempts = 0
    const retryingHandler = createWhatsAppWebhookRetryHandler(
      () => {
        attempts += 1
        throw new Error('Invalid webhook payload')
      },
      publisher(published),
      {
        maxRetries: 2,
        now: () => new Date('2026-09-30T22:30:00.000Z'),
      },
    )
    let event: EventMessage = {
      topic: 'wa-cloud.webhook.v1',
      key: '42',
      headers: { 'channel-id': '42', source: 'wa-cloud-webhook' },
      timestamp: 1_790_805_000_000,
      value: '{"invalid":true}',
    }

    await retryingHandler(event)
    event = publishedEventMessage(published[0]!, event.timestamp)
    await retryingHandler(event)
    event = publishedEventMessage(published[1]!, event.timestamp)
    await retryingHandler(event)

    assert.equal(attempts, 3)
    assert.deepEqual(
      published.map((item) => item.topic),
      [
        'wa-cloud.webhook.v1',
        'wa-cloud.webhook.v1',
        WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC,
      ],
    )
    const deadLetter = JSON.parse(
      published[2]?.value ?? '',
    ) as WhatsAppWebhookDeadLetter
    assert.deepEqual(deadLetter, {
      schemaVersion: 1,
      failedAt: '2026-09-30T22:30:00.000Z',
      retryCount: 2,
      attempts: 3,
      error: { name: 'Error', message: 'Invalid webhook payload' },
      originalEvent: {
        topic: 'wa-cloud.webhook.v1',
        key: '42',
        headers: {
          'channel-id': '42',
          source: 'wa-cloud-webhook',
          'x-webhook-retry-count': '2',
          'x-webhook-original-topic': 'wa-cloud.webhook.v1',
          'x-webhook-first-failed-at': '2026-09-30T22:30:00.000Z',
        },
        timestamp: 1_790_805_000_000,
        value: '{"invalid":true}',
      },
    })
  })

  it('automatically includes the dead-letter topic', () => {
    assert.deepEqual(
      includeWhatsAppReliabilityTopics([
        'demo.events.v1',
        'wa-cloud.webhook.v1',
      ]),
      [
        'demo.events.v1',
        'wa-cloud.webhook.v1',
        WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC,
      ],
    )
    assert.deepEqual(includeWhatsAppReliabilityTopics(['demo.events.v1']), [
      'demo.events.v1',
    ])
  })
})

describe('WhatsApp webhook forwarding subscriber', () => {
  it('posts the original body and signature to the requested URL', async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      requestInit = init
      return new Response(null, { status: 204 })
    }) as typeof fetch
    const handler = createWhatsAppWebhookForwardHandler(request)
    const body = JSON.stringify(webhook)
    const signature = `sha256=${'a'.repeat(64)}`

    await handler({
      topic: 'wa-cloud.webhook-forward.v1',
      key: '42',
      headers: { 'channel-id': '42' },
      timestamp: Date.now(),
      value: JSON.stringify({
        body,
        channelId: 42,
        contentType: 'application/json',
        signature,
        url: 'https://destination.example.com/whatsapp',
      }),
    })

    assert.equal(requestUrl, 'https://destination.example.com/whatsapp')
    assert.equal(requestInit?.method, 'POST')
    assert.equal(requestInit?.body, body)
    const headers = new Headers(requestInit?.headers)
    assert.equal(headers.get('content-type'), 'application/json')
    assert.equal(headers.get('x-hub-signature-256'), signature)
  })

  it('rejects failed downstream responses for worker retry handling', async () => {
    const handler = createWhatsAppWebhookForwardHandler(async () =>
      Promise.resolve(new Response(null, { status: 503 })),
    )

    await assert.rejects(
      async () =>
        handler({
          topic: 'wa-cloud.webhook-forward.v1',
          key: '42',
          headers: { 'channel-id': '42' },
          timestamp: Date.now(),
          value: JSON.stringify({
            body: JSON.stringify(webhook),
            channelId: 42,
            contentType: 'application/json',
            signature: `sha256=${'a'.repeat(64)}`,
            url: 'https://destination.example.com/whatsapp',
          }),
        }),
      /status 503/,
    )
  })
})

function publishedEventMessage(
  published: PublishedEvent,
  timestamp: number,
): EventMessage {
  return {
    topic: published.topic,
    key: published.options?.key ?? null,
    headers: published.options?.headers ?? {},
    timestamp,
    value: published.value,
  }
}
