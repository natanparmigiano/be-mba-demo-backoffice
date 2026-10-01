import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PostgresFileStore,
  type PostgresFileStoreBackend,
  type PostgresStoredFile,
} from './postgres.js'

class MemoryPostgresBackend implements PostgresFileStoreBackend {
  readonly files = new Map<string, PostgresStoredFile>()

  async delete(path: string): Promise<void> {
    this.files.delete(path)
  }

  async get(path: string): Promise<PostgresStoredFile | null> {
    return this.files.get(path) ?? null
  }

  async put(file: PostgresStoredFile): Promise<void> {
    this.files.set(file.path, file)
  }
}

const configuration = {
  adapter: 'postgres' as const,
  publicUrl: 'https://app.example.com',
  signingSecret: 'test-signing-secret',
}

describe('PostgresFileStore', () => {
  it('puts, gets, overwrites, and idempotently deletes files', async () => {
    const backend = new MemoryPostgresBackend()
    const store = new PostgresFileStore(configuration, backend)

    await store.put('organizations/123/avatar.png', new Uint8Array([1, 2]), {
      contentType: 'image/png',
    })
    const stored = await store.get('organizations/123/avatar.png')
    assert.deepEqual(stored?.body, new Uint8Array([1, 2]))
    assert.equal(stored?.contentType, 'image/png')
    assert.equal(stored?.size, 2)
    assert.ok(stored?.lastModified instanceof Date)

    await store.put('organizations/123/avatar.png', new Uint8Array([3]))
    assert.deepEqual(
      (await store.get('organizations/123/avatar.png'))?.body,
      new Uint8Array([3]),
    )
    assert.equal(
      (await store.get('organizations/123/avatar.png'))?.contentType,
      undefined,
    )

    await store.delete('organizations/123/avatar.png')
    await store.delete('organizations/123/avatar.png')
    assert.equal(await store.get('organizations/123/avatar.png'), null)
  })

  it('validates keys and signed URLs and rejects use after close', async () => {
    const store = new PostgresFileStore(
      configuration,
      new MemoryPostgresBackend(),
      () => 1_700_000_000_000,
    )

    await assert.rejects(() => store.get('../secret'), /relative path/)
    const url = await store.signUrl('media/photo.jpg', {
      operation: 'download',
      expiresInSeconds: 60,
    })
    assert.deepEqual(store.verifySignedUrl(new URL(url), 'download'), {
      key: 'media/photo.jpg',
      operation: 'download',
      contentType: undefined,
    })

    await store.close()
    await assert.rejects(() => store.get('closed.txt'), /closed/)
  })
})
