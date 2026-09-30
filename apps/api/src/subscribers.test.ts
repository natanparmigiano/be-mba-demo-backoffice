import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppWebhook } from '@mba-demo/schemas/wa-cloud/webhooks'
import { createWhatsAppWebhookHandler } from './subscribers.js'

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

describe('WhatsApp webhook subscriber', () => {
  it('validates the event envelope and invokes persistence', async () => {
    const calls: Array<{ channelId: number; webhook: WhatsAppWebhook }> = []
    const handler = createWhatsAppWebhookHandler(async (channelId, payload) => {
      calls.push({ channelId, webhook: payload })
      return {
        chatEvents: 0,
        contacts: 1,
        groups: 0,
        messages: 1,
        statuses: 0,
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
      chatEvents: 0,
      contacts: 0,
      groups: 0,
      messages: 0,
      statuses: 0,
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
})
