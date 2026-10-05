import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import type { WhatsAppChannelConfiguration } from '@mba-demo/db'
import { MemoryEventBus } from '@mba-demo/events'
import { app, createApp } from './app.js'
import {
  WA_CLOUD_WEBHOOK_FORWARD_TOPIC,
  WA_CLOUD_WEBHOOK_TOPIC,
  type WhatsAppWebhookForwardRequest,
} from './routes/wa-cloud.js'

describe('API', () => {
  it('reports its health', async () => {
    const response = await app.request('/api/health')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'ok',
      runtime: 'node',
    })
  })

  it('mounts the Better Auth handler', async () => {
    const response = await app.request('/api/auth/get-session')

    assert.equal(response.status, 200)
    assert.equal(await response.json(), null)
  })

  it('reports SSO availability without exposing provider details', async () => {
    const enabledApp = createApp({ hasSsoProviders: async () => true })
    const disabledApp = createApp({ hasSsoProviders: async () => false })

    const enabledResponse = await enabledApp.request(
      '/api/auth/sso-availability',
    )
    const disabledResponse = await disabledApp.request(
      '/api/auth/sso-availability',
    )

    assert.equal(enabledResponse.status, 200)
    assert.deepEqual(await enabledResponse.json(), { enabled: true })
    assert.equal(disabledResponse.status, 200)
    assert.deepEqual(await disabledResponse.json(), { enabled: false })
  })

  it('verifies and publishes valid WA Cloud webhook payloads', async () => {
    const eventBus = new MemoryEventBus()
    const received: Array<{
      headers: Readonly<Record<string, string>>
      key: string | null
      value: string
    }> = []
    eventBus.subscribe(WA_CLOUD_WEBHOOK_TOPIC, (event) => {
      received.push(event)
    })
    await eventBus.start()

    const channel = createTestChannel()
    const webhookApp = createApp({
      eventBus,
      waCloudWebhook: {
        findChannel: async (channelId) =>
          channelId === channel.id ? channel : undefined,
      },
    })
    const payload = JSON.stringify(createTestWebhook())
    const signature = sign(payload, channel.waAppSecret)
    const response = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: payload,
      },
    )

    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), {
      accepted: true,
      channelId: channel.id,
      mode: 'memory',
      topic: WA_CLOUD_WEBHOOK_TOPIC,
    })
    const [event] = received
    assert.ok(event)
    assert.equal(event.key, String(channel.id))
    assert.equal(event.value, payload)
    assert.match(event.headers['arrived-at'] ?? '', /^\d{4}-\d{2}-\d{2}T/)
    assert.deepEqual(
      { ...event.headers, 'arrived-at': undefined },
      {
        'arrived-at': undefined,
        'channel-id': String(channel.id),
        'content-type': 'application/json',
        source: 'wa-cloud-webhook',
      },
    )
    await eventBus.close()
  })

  it('publishes one forwarding request per channel URL', async () => {
    const eventBus = new MemoryEventBus()
    const received: WhatsAppWebhookForwardRequest[] = []
    eventBus.subscribe(WA_CLOUD_WEBHOOK_FORWARD_TOPIC, (event) => {
      received.push(JSON.parse(event.value) as WhatsAppWebhookForwardRequest)
    })
    await eventBus.start()

    const channel = createTestChannel({
      webhookForwardUrls: [
        'https://first.example.com/whatsapp',
        'https://second.example.com/whatsapp',
      ],
    })
    const webhookApp = createApp({
      eventBus,
      waCloudWebhook: { findChannel: async () => channel },
    })
    const payload = JSON.stringify(createTestWebhook())
    const signature = sign(payload, channel.waAppSecret)
    const response = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-hub-signature-256': signature,
        },
        body: payload,
      },
    )

    assert.equal(response.status, 202)
    assert.deepEqual(
      received.map((request) => request.url),
      channel.webhookForwardUrls,
    )
    assert.deepEqual(received[0], {
      body: payload,
      channelId: channel.id,
      contentType: 'application/json; charset=utf-8',
      signature,
      url: channel.webhookForwardUrls[0],
    })
    await eventBus.close()
  })

  it('supports the Meta webhook verification handshake', async () => {
    const channel = createTestChannel()
    const webhookApp = createApp({
      waCloudWebhook: {
        findChannel: async () => channel,
      },
    })
    const response = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=challenge-123`,
    )

    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'challenge-123')
  })

  it('rejects a webhook verification token from another channel', async () => {
    const channel = createTestChannel()
    const webhookApp = createApp({
      waCloudWebhook: {
        findChannel: async () => channel,
      },
    })
    const response = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123`,
    )

    assert.equal(response.status, 403)
  })

  it('rejects unsigned and channel-mismatched WA Cloud webhooks', async () => {
    const channel = createTestChannel()
    const webhookApp = createApp({
      waCloudWebhook: {
        findChannel: async () => channel,
      },
    })
    const payload = JSON.stringify(createTestWebhook())
    const unsignedResponse = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      },
    )
    const mismatchedPayload = JSON.stringify({
      ...createTestWebhook(),
      entry: [{ ...createTestWebhook().entry[0], id: 'another-waba' }],
    })
    const mismatchedResponse = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(mismatchedPayload, channel.waAppSecret),
        },
        body: mismatchedPayload,
      },
    )

    assert.equal(unsignedResponse.status, 401)
    assert.equal(mismatchedResponse.status, 400)
  })

  it('rejects a signed body that is not a valid WA Cloud webhook', async () => {
    const channel = createTestChannel()
    const webhookApp = createApp({
      waCloudWebhook: {
        findChannel: async () => channel,
      },
    })
    const payload = JSON.stringify({ object: 'not-whatsapp', entry: [] })
    const response = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(payload, channel.waAppSecret),
        },
        body: payload,
      },
    )

    assert.equal(response.status, 400)
    const responseBody: unknown = await response.json()
    assert.ok(isRecord(responseBody))
    assert.equal(responseBody.message, 'Invalid WhatsApp webhook payload')
  })

  it('serves the frontend with SPA fallback without masking API 404s', async () => {
    const staticApp = createApp({ webRoot: '../web' })
    const pageResponse = await staticApp.request('/dashboard')
    const apiResponse = await staticApp.request('/api/missing')

    assert.equal(pageResponse.status, 200)
    assert.match(
      await pageResponse.text(),
      /<title>MBA Demo Backoffice<\/title>/,
    )
    assert.equal(apiResponse.status, 404)
    assert.deepEqual(await apiResponse.json(), { message: 'Not found' })
  })

})

function createTestChannel(
  overrides: Partial<WhatsAppChannelConfiguration> = {},
): WhatsAppChannelConfiguration {
  return {
    id: 123,
    organizationId: 'test-organization',
    type: 'whatsapp',
    waAppSecret: 'test-app-secret',
    waWebhookVerifyToken: 'verify-me',
    waPhoneNumber: '15550001111',
    waPhoneNumberId: 'phone-number-id',
    waSystemUserAccessToken: 'system-user-access-token',
    waWabaId: 'business-account',
    webhookForwardUrls: [],
    ...overrides,
  }
}

function createTestWebhook() {
  return {
    object: 'whatsapp_business_account' as const,
    entry: [
      {
        id: 'business-account',
        time: 1_700_000_000,
        changes: [
          {
            field: 'messages' as const,
            value: {
              messaging_product: 'whatsapp' as const,
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              contacts: [
                {
                  profile: { name: 'Test Contact' },
                  wa_id: '15550002222',
                },
              ],
              messages: [
                {
                  from: '15550002222',
                  id: 'wamid.test',
                  timestamp: '1700000000',
                  type: 'text' as const,
                  text: { body: 'hello' },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

function sign(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
