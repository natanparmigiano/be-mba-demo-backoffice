import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryKeyValueStore } from './memory.js'
import {
  PostgresKeyValueStore,
  type PostgresKeyValueBackend,
} from './postgres.js'
import type { SetOptions } from './types.js'

class MemoryPostgresBackend implements PostgresKeyValueBackend {
  readonly store = new MemoryKeyValueStore()

  del(keys: string[]) {
    return this.store.del(...keys)
  }
  expire(key: string, seconds: number) {
    return this.store.expire(key, seconds)
  }
  get(key: string) {
    return this.store.get(key)
  }
  getDel(key: string) {
    return this.store.getDel(key)
  }
  incrBy(key: string, increment: number) {
    return this.store.incrBy(key, increment)
  }
  mGet(keys: string[]) {
    return this.store.mGet(keys)
  }
  mSet(entries: Readonly<Record<string, string>>) {
    return this.store.mSet(entries)
  }
  async ping() {}
  persist(key: string) {
    return this.store.persist(key)
  }
  set(key: string, value: string, options: SetOptions) {
    return this.store.set(key, value, options)
  }
  ttl(key: string) {
    return this.store.ttl(key)
  }
}

describe('PostgresKeyValueStore', () => {
  it('exposes Redis-compatible operations through its backend', async () => {
    const store = new PostgresKeyValueStore(new MemoryPostgresBackend())

    assert.equal(await store.set('one', '1'), true)
    assert.equal(
      await store.set('one', 'ignored', { condition: 'if-not-exists' }),
      false,
    )
    await store.mSet({ two: '2', three: '3' })
    assert.deepEqual(await store.mGet(['three', 'missing', 'one']), [
      '3',
      null,
      '1',
    ])
    assert.equal(await store.exists('one', 'missing', 'one'), 2)
    assert.equal(await store.incrBy('one', 4), 5)
    assert.equal(await store.decr('one'), 4)
    assert.equal(await store.getDel('two'), '2')
    assert.equal(await store.get('two'), null)
    assert.equal(await store.ping(), 'PONG')
    assert.equal(await store.del('one', 'three'), 2)
  })

  it('validates TTLs and counter inputs', async () => {
    const store = new PostgresKeyValueStore(new MemoryPostgresBackend())

    await assert.rejects(
      () => store.set('key', 'value', { ttlSeconds: 0 }),
      /greater than zero/,
    )
    await assert.rejects(() => store.incrBy('key', 0.5), /safe integer/)
    await assert.rejects(() => store.expire('key', 0.5), /safe integer/)
  })
})
