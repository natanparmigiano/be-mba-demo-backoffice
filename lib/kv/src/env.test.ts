import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getRedisUrl } from './env.js'

describe('KV environment', () => {
  it('selects memory mode when REDIS_URL is absent', () => {
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
