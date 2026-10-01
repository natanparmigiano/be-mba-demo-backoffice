import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RUNNER_EXECUTION_REQUESTED_TOPIC,
  createRunnerExecutionPublisher,
} from './events.js'

describe('runner execution events', () => {
  it('publishes only the versioned execution ID envelope', async () => {
    let published:
      { topic: string; value: string; key: string | undefined } | undefined
    const publish = createRunnerExecutionPublisher({
      publish: async (topic, value, options) => {
        published = { topic, value, key: options?.key }
      },
    })

    await publish(42)

    assert.deepEqual(published, {
      topic: RUNNER_EXECUTION_REQUESTED_TOPIC,
      value: JSON.stringify({ schemaVersion: 1, executionId: 42 }),
      key: '42',
    })
  })
})
