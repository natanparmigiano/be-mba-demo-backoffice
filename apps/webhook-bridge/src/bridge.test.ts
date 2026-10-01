import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PublishOptions } from '@mba-demo/events'
import {
  MAX_WEBHOOK_BYTES,
  publishDelivery,
  runWebhookBridge,
  WA_CLOUD_WEBHOOK_TOPIC,
} from './bridge.js'
import type {
  DeliveryBatchResult,
  DeliveryOutcome,
  WebhookDelivery,
  WebhookDeliveryQueue,
} from './bridge.js'

interface PublishedEvent {
  options?: PublishOptions
  topic: string
  value: string
}

function validWebhook(): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'source-waba',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'source-phone-number',
              },
              contacts: [
                { profile: { name: 'Test Contact' }, wa_id: '15550002222' },
              ],
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
  })
}

function publisher(events: PublishedEvent[]) {
  return {
    publish(topic: string, value: string, options?: PublishOptions) {
      events.push({ topic, value, options })
      return Promise.resolve()
    },
  }
}

describe('publishDelivery', () => {
  it('publishes the original body with the webhook route event shape', async () => {
    const events: PublishedEvent[] = []
    const rawPayload = validWebhook()

    assert.equal(
      await publishDelivery(
        publisher(events),
        { id: '1', payloadValid: true, rawPayload },
        42,
      ),
      'published',
    )
    assert.deepEqual(events, [
      {
        topic: WA_CLOUD_WEBHOOK_TOPIC,
        value: rawPayload,
        options: {
          key: '42',
          headers: {
            'channel-id': '42',
            'content-type': 'application/json',
            source: 'wa-cloud-webhook',
          },
        },
      },
    ])
  })

  it('publishes rows rejected by the source or shared webhook schema', async () => {
    const events: PublishedEvent[] = []
    const validationFailures: string[] = []

    assert.equal(
      await publishDelivery(
        publisher(events),
        { id: '1', payloadValid: false, rawPayload: '{}' },
        42,
        (_delivery, reason) => {
          validationFailures.push(reason)
        },
      ),
      'published',
    )
    assert.equal(
      await publishDelivery(
        publisher(events),
        { id: '2', payloadValid: true, rawPayload: 'not-json' },
        42,
        (_delivery, reason) => {
          validationFailures.push(reason)
        },
      ),
      'published',
    )
    assert.equal(
      await publishDelivery(
        publisher(events),
        {
          id: '3',
          payloadValid: true,
          rawPayload: JSON.stringify({ object: 'other', entry: [] }),
        },
        42,
        (_delivery, reason) => {
          validationFailures.push(reason)
        },
      ),
      'published',
    )
    assert.equal(
      await publishDelivery(
        publisher(events),
        {
          id: '4',
          payloadValid: true,
          rawPayload: 'x'.repeat(MAX_WEBHOOK_BYTES + 1),
        },
        42,
        (_delivery, reason) => {
          validationFailures.push(reason)
        },
      ),
      'published',
    )

    assert.deepEqual(
      events.map((event) => event.value),
      [
        '{}',
        'not-json',
        JSON.stringify({ object: 'other', entry: [] }),
        'x'.repeat(MAX_WEBHOOK_BYTES + 1),
      ],
    )
    assert.equal(validationFailures[0], 'source row is marked invalid')
    assert.equal(validationFailures[1], 'raw_payload is not valid JSON')
    assert.match(
      validationFailures[2] ?? '',
      /^raw_payload is not a valid WhatsApp webhook: \[invalid_value\] \$\.object:/,
    )
    assert.equal(
      validationFailures[3],
      'raw_payload exceeds the 1 MiB webhook limit',
    )
  })

  it('reports every schema issue with its code and JSON path', async () => {
    const validationFailures: string[] = []

    assert.equal(
      await publishDelivery(
        publisher([]),
        {
          id: '1',
          payloadValid: true,
          rawPayload: JSON.stringify({
            object: 'whatsapp_business_account',
            entry: [{ id: 123, changes: [] }],
          }),
        },
        42,
        (_delivery, reason) => {
          validationFailures.push(reason)
        },
      ),
      'published',
    )

    assert.equal(validationFailures.length, 1)
    assert.match(
      validationFailures[0] ?? '',
      /\[invalid_type\] \$\.entry\[0\]\.id:/,
    )
    assert.match(
      validationFailures[0] ?? '',
      /\[too_small\] \$\.entry\[0\]\.changes:/,
    )
  })
})

describe('runWebhookBridge', () => {
  it('accumulates a batch and stops cleanly when aborted', async () => {
    const controller = new AbortController()
    const delivery: WebhookDelivery = {
      id: '1',
      payloadValid: true,
      rawPayload: validWebhook(),
    }
    const queue: WebhookDeliveryQueue = {
      async consumeBatch(
        limit: number,
        consume: (item: WebhookDelivery) => Promise<DeliveryOutcome>,
      ): Promise<DeliveryBatchResult> {
        assert.equal(limit, 10)
        const outcome = await consume(delivery)
        return {
          selected: 1,
          published: outcome === 'published' ? 1 : 0,
        }
      },
      close: () => Promise.resolve(),
    }
    const events: PublishedEvent[] = []

    const stats = await runWebhookBridge(queue, publisher(events), {
      batchSize: 10,
      channelId: 7,
      signal: controller.signal,
      onBatch: () => controller.abort(),
    })

    assert.deepEqual(stats, {
      batches: 1,
      selected: 1,
      published: 1,
    })
    assert.equal(events.length, 1)
  })
})
