import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createKeyValueStore } from './index.js'

describe('createKeyValueStore', () => {
  it('uses memory when explicitly configured', async () => {
    const store = createKeyValueStore({ adapter: 'memory' })

    assert.equal(store.mode, 'memory')
    await store.close()
  })

  it('uses Redis when a Redis URL is provided without connecting eagerly', async () => {
    const store = createKeyValueStore({
      adapter: 'redis',
      redisUrl: 'redis://localhost:6379',
    })

    assert.equal(store.mode, 'redis')
    await store.close()
  })

  it('uses Postgres when configured without connecting eagerly', async () => {
    const store = createKeyValueStore({ adapter: 'postgres' })

    assert.equal(store.mode, 'postgres')
    await store.close()
  })
})
