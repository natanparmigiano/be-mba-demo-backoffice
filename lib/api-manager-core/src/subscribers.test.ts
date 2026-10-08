import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRunnerExecutionHandler } from './subscribers.js'

describe('manager runner execution subscriber', () => {
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
