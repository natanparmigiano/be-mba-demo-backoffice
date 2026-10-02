import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEVELOPMENT_DATABASE_URL, getDatabaseUrl } from './env.js'

describe('database environment', () => {
  it('uses a local Postgres URL outside production', () => {
    assert.equal(
      getDatabaseUrl({ NODE_ENV: 'development' }),
      DEVELOPMENT_DATABASE_URL,
    )
  })

  it('requires DATABASE_URL in production', () => {
    assert.throws(
      () => getDatabaseUrl({ NODE_ENV: 'production' }),
      /DATABASE_URL is required/,
    )
  })

  it('accepts a configured Postgres URL', () => {
    const databaseUrl = 'postgresql://app:secret@db.internal:5432/app'

    assert.equal(
      getDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: databaseUrl }),
      databaseUrl,
    )
  })

  it('removes unsupported verifySSL parameters from provider URLs', () => {
    assert.equal(
      getDatabaseUrl({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app:secret@db.internal:5432/app?ssl=true&verifySSL=true&application_name=mba',
      }),
      'postgresql://app:secret@db.internal:5432/app?ssl=true&application_name=mba',
    )
  })

  it('rejects non-Postgres URLs', () => {
    assert.throws(
      () => getDatabaseUrl({ DATABASE_URL: 'https://example.com/database' }),
      /must use the postgres:\/\//,
    )
  })
})
