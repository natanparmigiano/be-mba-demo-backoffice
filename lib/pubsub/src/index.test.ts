import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPubSub } from './index.js'

describe('createPubSub', () => {
  it('uses memory when no Redis URL is provided', async () => {
    const bus = createPubSub(undefined)

    assert.equal(bus.mode, 'memory')
    await bus.close()
  })

  it('uses Redis without connecting eagerly when a URL is provided', async () => {
    const bus = createPubSub('redis://localhost:6379')

    assert.equal(bus.mode, 'redis')
    await bus.close()
  })
})
