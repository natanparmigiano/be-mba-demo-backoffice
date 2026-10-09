import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEVELOPMENT_AUTH_SECRET,
  DEVELOPMENT_AUTH_URL,
  getAuthEnvironment,
} from './env.js'

describe('auth environment', () => {
  it('uses local-only defaults during development', () => {
    assert.deepEqual(getAuthEnvironment({ NODE_ENV: 'development' }), {
      baseURL: DEVELOPMENT_AUTH_URL,
      secret: DEVELOPMENT_AUTH_SECRET,
      trustedOrigins: ['http://localhost:44100'],
    })
  })

  it('requires a secret in production', () => {
    assert.throws(
      () =>
        getAuthEnvironment({
          NODE_ENV: 'production',
          BETTER_AUTH_URL: 'https://api.example.com',
        }),
      /BETTER_AUTH_SECRET is required/,
    )
  })

  it('requires a base URL in production', () => {
    assert.throws(
      () =>
        getAuthEnvironment({
          NODE_ENV: 'production',
          BETTER_AUTH_SECRET: 'a-production-secret-with-at-least-32-characters',
        }),
      /BETTER_AUTH_URL is required/,
    )
  })
})
