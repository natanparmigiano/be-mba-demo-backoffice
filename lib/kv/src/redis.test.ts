import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RedisClientType } from 'redis'
import { RedisKeyValueStore } from './redis.js'

describe('RedisKeyValueStore fixed-window counters', () => {
  it('increments and assigns expiration in one atomic script', async () => {
    const calls: Array<{
      script: string
      options: { keys: string[]; arguments: string[] }
    }> = []
    const client = {
      isOpen: true,
      on: () => client,
      eval: async (
        script: string,
        options: { keys: string[]; arguments: string[] },
      ) => {
        calls.push({ script, options })
        return 1
      },
    } as unknown as RedisClientType
    const store = new RedisKeyValueStore('redis://localhost:6379', client)

    assert.equal(await store.incrementWithTtl('rate-limit', 10), 1)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0]?.options, {
      keys: ['rate-limit'],
      arguments: ['10'],
    })
    assert.match(calls[0]?.script ?? '', /redis\.call\('TTL'/)
    assert.match(calls[0]?.script ?? '', /redis\.call\('SET'/)
    assert.match(calls[0]?.script ?? '', /redis\.call\('INCR'/)
  })

  it('rejects invalid expiration before contacting Redis', async () => {
    let evaluated = false
    const client = {
      isOpen: true,
      on: () => client,
      eval: async () => {
        evaluated = true
        return 1
      },
    } as unknown as RedisClientType
    const store = new RedisKeyValueStore('redis://localhost:6379', client)

    await assert.rejects(
      () => store.incrementWithTtl('rate-limit', 0),
      /greater than zero/,
    )
    assert.equal(evaluated, false)
  })
})
