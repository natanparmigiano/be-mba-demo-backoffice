import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemFileStore } from './filesystem.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  )
})

describe('FileSystemFileStore', () => {
  it('puts, gets, overwrites, and deletes files with metadata', async () => {
    const store = await createStore()

    await store.put('organizations/123/avatar.png', new Uint8Array([1, 2]), {
      contentType: 'image/png',
    })
    assert.deepEqual(await store.get('organizations/123/avatar.png'), {
      body: new Uint8Array([1, 2]),
      contentType: 'image/png',
      lastModified: (await store.get('organizations/123/avatar.png'))
        ?.lastModified,
      size: 2,
    })

    await store.put('organizations/123/avatar.png', new Uint8Array([3]))
    const overwritten = await store.get('organizations/123/avatar.png')
    assert.deepEqual(overwritten?.body, new Uint8Array([3]))
    assert.equal(overwritten?.contentType, undefined)

    await store.delete('organizations/123/avatar.png')
    await store.delete('organizations/123/avatar.png')
    assert.equal(await store.get('organizations/123/avatar.png'), null)
  })

  it('rejects traversal keys', async () => {
    const store = await createStore()

    await assert.rejects(
      () => store.put('../secret', new Uint8Array()),
      /relative path/,
    )
    await assert.rejects(() => store.get('/absolute'), /relative path/)
  })

  it('creates and verifies tamper-resistant upload and download URLs', async () => {
    let now = 1_700_000_000_000
    const store = await createStore(() => now)
    const downloadUrl = await store.signUrl('media/photo.jpg', {
      operation: 'download',
      expiresInSeconds: 60,
    })
    const uploadUrl = await store.signUrl('media/photo.jpg', {
      operation: 'upload',
      contentType: 'image/jpeg',
      expiresInSeconds: 60,
    })

    assert.deepEqual(store.verifySignedUrl(new URL(downloadUrl), 'download'), {
      key: 'media/photo.jpg',
      operation: 'download',
      contentType: undefined,
    })
    assert.deepEqual(store.verifySignedUrl(new URL(uploadUrl), 'upload'), {
      key: 'media/photo.jpg',
      operation: 'upload',
      contentType: 'image/jpeg',
    })

    const tampered = new URL(downloadUrl)
    tampered.searchParams.set('key', 'media/other.jpg')
    assert.equal(store.verifySignedUrl(tampered, 'download'), null)
    assert.equal(store.verifySignedUrl(new URL(downloadUrl), 'upload'), null)

    now += 61_000
    assert.equal(store.verifySignedUrl(new URL(downloadUrl), 'download'), null)
  })

  it('cannot be used after close', async () => {
    const store = await createStore()
    await store.close()

    await assert.rejects(() => store.get('closed.txt'), /closed/)
  })
})

async function createStore(now?: () => number): Promise<FileSystemFileStore> {
  const directory = await mkdtemp(join(tmpdir(), 'mba-desk-files-'))
  directories.push(directory)
  return new FileSystemFileStore(
    {
      adapter: 'fs',
      directory,
      publicUrl: 'https://app.example.com/base',
      signingSecret: 'test-signing-secret',
    },
    now,
  )
}
