import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createKeyValueStore } from './index.js'

describe('createKeyValueStore', () => {
  it('uses memory when no Redis URL is provided', async () => {
    const store = createKeyValueStore(undefined)

    assert.equal(store.mode, 'memory')
    await store.close()
  })

  it('uses Redis when a Redis URL is provided without connecting eagerly', async () => {
    const store = createKeyValueStore('redis://localhost:6379')

    assert.equal(store.mode, 'redis')
    await store.close()
  })
})
