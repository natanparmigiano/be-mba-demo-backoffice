import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getFileStoreConfiguration } from './env.js'

describe('files environment', () => {
  it('uses safe development filesystem defaults', () => {
    assert.deepEqual(getFileStoreConfiguration({}), {
      adapter: 'fs',
      directory: '.data/files',
      publicUrl: 'http://localhost:3000',
      signingSecret: 'development-only-files-signing-secret',
    })
  })

  it('requires filesystem URL and signing secret in production', () => {
    assert.throws(
      () => getFileStoreConfiguration({ NODE_ENV: 'production' }),
      /FILES_PUBLIC_URL/,
    )
    assert.throws(
      () =>
        getFileStoreConfiguration({
          NODE_ENV: 'production',
          FILES_PUBLIC_URL: 'https://files.example.com',
        }),
      /FILES_SIGNING_SECRET/,
    )
  })

  it('parses S3-compatible storage configuration', () => {
    assert.deepEqual(
      getFileStoreConfiguration({
        FILES_ADAPTER: 's3',
        FILES_S3_ACCESS_KEY_ID: 'minio',
        FILES_S3_BUCKET: 'uploads',
        FILES_S3_CREATE_BUCKET: 'true',
        FILES_S3_ENDPOINT: 'http://minio:9000',
        FILES_S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
        FILES_S3_SECRET_ACCESS_KEY: 'secret',
      }),
      {
        accessKeyId: 'minio',
        adapter: 's3',
        bucket: 'uploads',
        createBucket: true,
        endpoint: 'http://minio:9000',
        forcePathStyle: true,
        publicEndpoint: 'http://localhost:9000',
        region: 'us-east-1',
        secretAccessKey: 'secret',
      },
    )
  })

  it('rejects partial credentials and invalid adapter values', () => {
    assert.throws(
      () =>
        getFileStoreConfiguration({
          FILES_ADAPTER: 's3',
          FILES_S3_ACCESS_KEY_ID: 'minio',
          FILES_S3_BUCKET: 'uploads',
        }),
      /must either both be configured/,
    )
    assert.throws(
      () => getFileStoreConfiguration({ FILES_ADAPTER: 'memory' }),
      /either fs or s3/,
    )
  })
})
