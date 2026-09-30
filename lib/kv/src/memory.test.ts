import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryKeyValueStore } from './memory.js'

describe('MemoryKeyValueStore', () => {
  it('supports single and multi-key operations', async () => {
    const store = new MemoryKeyValueStore()

    assert.equal(await store.set('one', 'first'), true)
    await store.mSet({ two: 'second', three: 'third' })

    assert.equal(await store.get('one'), 'first')
    assert.deepEqual(await store.mGet(['one', 'missing', 'three']), [
      'first',
      null,
      'third',
    ])
    assert.equal(await store.exists('one', 'missing', 'one'), 2)
    assert.equal(await store.del('one', 'two', 'one'), 2)
  })

  it('supports conditional writes', async () => {
    const store = new MemoryKeyValueStore()

    assert.equal(
      await store.set('key', 'first', { condition: 'if-exists' }),
      false,
    )
    assert.equal(
      await store.set('key', 'first', { condition: 'if-not-exists' }),
      true,
    )
    assert.equal(
      await store.set('key', 'second', { condition: 'if-not-exists' }),
      false,
    )
    assert.equal(
      await store.set('key', 'second', { condition: 'if-exists' }),
      true,
    )
    assert.equal(await store.get('key'), 'second')
  })

  it('gets and deletes a value atomically', async () => {
    const store = new MemoryKeyValueStore()

    await store.set('single-use', 'value')
    assert.equal(await store.getDel('single-use'), 'value')
    assert.equal(await store.get('single-use'), null)
  })

  it('expires and persists values with Redis-compatible TTL results', async () => {
    let now = 1_000
    const store = new MemoryKeyValueStore(() => now)

    await store.set('temporary', 'value', { ttlSeconds: 10 })
    assert.equal(await store.ttl('temporary'), 10)

    now += 4_000
    assert.equal(await store.ttl('temporary'), 6)
    assert.equal(await store.persist('temporary'), true)
    assert.equal(await store.ttl('temporary'), -1)

    assert.equal(await store.expire('temporary', 1), true)
    now += 1_000
    assert.equal(await store.get('temporary'), null)
    assert.equal(await store.ttl('temporary'), -2)
  })

  it('increments integer values while preserving expiry', async () => {
    const store = new MemoryKeyValueStore()

    assert.equal(await store.incr('counter'), 1)
    assert.equal(await store.incrBy('counter', 4), 5)
    assert.equal(await store.decr('counter'), 4)
    assert.equal(await store.decrBy('counter', 2), 2)
    assert.equal(await store.get('counter'), '2')

    await store.set('not-a-number', 'value')
    await assert.rejects(() => store.incr('not-a-number'), /not an integer/)
  })
})
