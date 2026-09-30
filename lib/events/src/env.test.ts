import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getKafkaConfiguration } from './env.js'

describe('event bus environment', () => {
  it('selects memory mode when Kafka configuration is absent', () => {
    assert.equal(getKafkaConfiguration({}), undefined)
  })

  it('parses Kafka client and broker configuration', () => {
    assert.deepEqual(
      getKafkaConfiguration({
        KAFKA_CLIENT_ID: 'api',
        KAFKA_BROKERS: ' kafka-1:9092, kafka-2:9092 ',
      }),
      {
        clientId: 'api',
        brokers: ['kafka-1:9092', 'kafka-2:9092'],
        groupId: 'api-consumer',
      },
    )
  })

  it('rejects partial Kafka configuration', () => {
    assert.throws(
      () => getKafkaConfiguration({ KAFKA_CLIENT_ID: 'api' }),
      /must either both be configured/,
    )
    assert.throws(
      () => getKafkaConfiguration({ KAFKA_BROKERS: 'localhost:9092' }),
      /must either both be configured/,
    )
  })
})
