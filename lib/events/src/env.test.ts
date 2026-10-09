import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getKafkaConfiguration, getSqsConfiguration } from './env.js'

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

  it('parses an SQS FIFO queue configuration', () => {
    assert.deepEqual(
      getSqsConfiguration({
        SQS_ENDPOINT: 'http://localhost:4566',
        SQS_QUEUE_URL: 'http://localhost:4566/000000000000/events.fifo',
        SQS_REGION: 'sa-east-1',
      }),
      {
        endpoint: 'http://localhost:4566/',
        queueUrl: 'http://localhost:4566/000000000000/events.fifo',
        region: 'sa-east-1',
      },
    )
  })

  it('rejects a standard SQS queue and partial SQS configuration', () => {
    assert.throws(
      () =>
        getSqsConfiguration({
          SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/events',
        }),
      /FIFO queue ending in \.fifo/,
    )
    assert.throws(
      () => getSqsConfiguration({ SQS_REGION: 'us-east-1' }),
      /SQS_QUEUE_URL must be configured/,
    )
  })
})
