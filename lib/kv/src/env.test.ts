import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getKeyValueConfiguration, getRedisUrl } from './env.js'

describe('KV environment', () => {
  it('returns no Redis URL when REDIS_URL is absent', () => {
    assert.equal(getRedisUrl({}), undefined)
    assert.equal(getRedisUrl({ REDIS_URL: '  ' }), undefined)
  })

  it('accepts redis and rediss URLs', () => {
    assert.equal(
      getRedisUrl({ REDIS_URL: 'redis://localhost:6379' }),
      'redis://localhost:6379',
    )
    assert.equal(
      getRedisUrl({ REDIS_URL: 'rediss://cache.example.com' }),
      'rediss://cache.example.com',
    )
  })

  it('rejects invalid URLs and protocols', () => {
    assert.throws(
      () => getRedisUrl({ REDIS_URL: 'not-a-url' }),
      /valid Redis URL/,
    )
    assert.throws(
      () => getRedisUrl({ REDIS_URL: 'https://example.com' }),
      /redis:\/\//,
    )
  })
})

describe('KV adapter configuration', () => {
  it('uses Postgres by default and Redis when configured', () => {
    assert.deepEqual(getKeyValueConfiguration({}), { adapter: 'postgres' })
    assert.deepEqual(
      getKeyValueConfiguration({ REDIS_URL: 'redis://localhost:6379' }),
      { adapter: 'redis', redisUrl: 'redis://localhost:6379' },
    )
  })

  it('supports an explicit Postgres adapter', () => {
    assert.deepEqual(getKeyValueConfiguration({ KV_ADAPTER: 'postgres' }), {
      adapter: 'postgres',
    })
  })

  it('supports explicit memory mode', () => {
    assert.deepEqual(getKeyValueConfiguration({ KV_ADAPTER: 'memory' }), {
      adapter: 'memory',
    })
  })

  it('validates explicit adapter configuration', () => {
    assert.throws(
      () => getKeyValueConfiguration({ KV_ADAPTER: 'redis' }),
      /REDIS_URL is required/,
    )
    assert.throws(
      () => getKeyValueConfiguration({ KV_ADAPTER: 'unknown' }),
      /KV_ADAPTER must be/,
    )
  })
})
