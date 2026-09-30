import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryKeyValueStore } from '@mba-demo/kv'
import { createSecondaryStorage } from './secondary-storage.js'

describe('Better Auth secondary storage', () => {
  it('delegates reads, writes, expiration, and deletion to KV', async () => {
    let now = 1_000
    const kv = new MemoryKeyValueStore(() => now)
    const storage = createSecondaryStorage(kv)

    await storage.set('session', 'value', 10)
    assert.equal(await storage.get('session'), 'value')

    now += 10_000
    assert.equal(await storage.get('session'), null)

    await storage.set('session', 'new-value')
    assert.equal(await storage.getAndDelete('session'), 'new-value')
    assert.equal(await storage.get('session'), null)

    assert.equal(await storage.increment('attempts'), 1)
    await storage.delete('attempts')
  })
})
