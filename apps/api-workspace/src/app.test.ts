import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import type { WhatsAppChannelConfiguration } from '@mba-desk/db'
import { MemoryEventBus } from '@mba-desk/events'
import { WA_CLOUD_WEBHOOK_TOPIC } from '@mba-desk/api-workspace-core/routes/wa-cloud'
import { app, createWorkspaceApp } from './app.js'

describe('workspace API surface', () => {
  it('exposes common health and workspace routes', async () => {
    assert.equal((await app.request('/api/health')).status, 200)
    assert.notEqual((await app.request('/api/chats')).status, 404)
  })

  it('does not expose manager routes and does expose core channel mutations', async () => {
    const managerRoute = await app.request('/api/runner/functions')
    const channelMutation = await app.request('/api/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    assert.equal(managerRoute.status, 404)
    assert.notEqual(channelMutation.status, 404)
    assert.deepEqual(await managerRoute.json(), { message: 'Not found' })
  })

  it('owns WA Cloud webhook ingress and publishes valid payloads', async () => {
    const eventBus = new MemoryEventBus()
    const received: string[] = []
    eventBus.subscribe(WA_CLOUD_WEBHOOK_TOPIC, (event) => {
      received.push(event.value)
    })
    await eventBus.start()
    const channel = createTestChannel()
    const webhookApp = createWorkspaceApp({
      eventBus,
      waCloudWebhook: { findChannel: async () => channel },
    })
    const payload = JSON.stringify(createTestWebhook())
    const response = await webhookApp.request(
      `/api/wa-cloud/webhook/${channel.id}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': `sha256=${createHmac('sha256', channel.waAppSecret).update(payload).digest('hex')}`,
        },
        body: payload,
      },
    )

    assert.equal(response.status, 202)
    assert.deepEqual(received, [payload])
    await eventBus.close()
  })
})

function createTestChannel(): WhatsAppChannelConfiguration {
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
