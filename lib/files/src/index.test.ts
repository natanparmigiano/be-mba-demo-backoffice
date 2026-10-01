import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createFileStore } from './index.js'

describe('createFileStore', () => {
  it('creates the configured adapter without connecting eagerly', async () => {
    const filesystem = createFileStore({
      adapter: 'fs',
      directory: '.data/test-files',
      publicUrl: 'http://localhost:3000',
      signingSecret: 'test-secret',
    })
    const s3 = createFileStore({
      adapter: 's3',
      bucket: 'files',
      createBucket: false,
      forcePathStyle: true,
      region: 'us-east-1',
    })
    const postgres = createFileStore({
      adapter: 'postgres',
      publicUrl: 'http://localhost:3000',
      signingSecret: 'test-secret',
    })

    assert.equal(filesystem.mode, 'fs')
    assert.equal(s3.mode, 's3')
    assert.equal(postgres.mode, 'postgres')
    await filesystem.close()
    await s3.close()
    await postgres.close()
  })
})
