import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getMissingTopics, KafkaEventBus } from './kafka.js'

describe('Kafka topic initialization', () => {
  it('constructs Confluent clients without connecting eagerly', async () => {
    const bus = new KafkaEventBus({
      brokers: ['localhost:9092'],
      clientId: 'events-test',
      groupId: 'events-test-consumer',
    })

    assert.equal(bus.mode, 'kafka')
    await bus.close()
    await assert.rejects(bus.start(), /Event bus is closed/)
  })

  it('only requests creation for missing topics', () => {
    assert.deepEqual(
      getMissingTopics(
        ['demo.events.v1', 'wa-cloud.webhook.v1'],
        ['__consumer_offsets', 'demo.events.v1', 'wa-cloud.webhook.v1'],
      ),
      [],
    )

    assert.deepEqual(
      getMissingTopics(
        ['demo.events.v1', 'wa-cloud.webhook.v1'],
        ['demo.events.v1'],
      ),
      ['wa-cloud.webhook.v1'],
    )
  })
})
