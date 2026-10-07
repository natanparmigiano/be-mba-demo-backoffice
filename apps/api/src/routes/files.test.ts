import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemFileStore } from '@mba-desk/files'
import { createApp } from '../app.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  )
})

describe('signed filesystem routes', () => {
  it('accepts signed uploads and serves signed downloads', async () => {
    const store = await createStore()
    const fileApp = createApp({ fileStore: store })
    const uploadUrl = await store.signUrl('media/photo.jpg', {
      operation: 'upload',
      contentType: 'image/jpeg',
    })
    const uploadResponse = await fileApp.request(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: new Uint8Array([1, 2, 3]),
    })

    assert.equal(uploadResponse.status, 204)
    assert.deepEqual(
      (await store.get('media/photo.jpg'))?.body,
      new Uint8Array([1, 2, 3]),
    )

    const downloadUrl = await store.signUrl('media/photo.jpg', {
      operation: 'download',
    })
    const downloadResponse = await fileApp.request(downloadUrl)

    assert.equal(downloadResponse.status, 200)
    assert.equal(downloadResponse.headers.get('content-type'), 'image/jpeg')
    assert.equal(downloadResponse.headers.get('content-length'), '3')
    assert.deepEqual(
      new Uint8Array(await downloadResponse.arrayBuffer()),
      new Uint8Array([1, 2, 3]),
    )
  })

  it('rejects tampered URLs and signed content-type mismatches', async () => {
    const store = await createStore()
    const fileApp = createApp({ fileStore: store })
    const signedUrl = new URL(
      await store.signUrl('media/photo.jpg', {
        operation: 'upload',
        contentType: 'image/jpeg',
      }),
    )
    signedUrl.searchParams.set('key', 'media/other.jpg')

    const tamperedResponse = await fileApp.request(signedUrl, { method: 'PUT' })
    const contentTypeResponse = await fileApp.request(
      await store.signUrl('media/photo.jpg', {
        operation: 'upload',
        contentType: 'image/jpeg',
      }),
      {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'not an image',
      },
    )

    assert.equal(tamperedResponse.status, 403)
    assert.deepEqual(await tamperedResponse.json(), {
      message: 'Invalid or expired file URL',
    })
    assert.equal(contentTypeResponse.status, 403)
    assert.equal(await store.get('media/photo.jpg'), null)
  })
})

async function createStore(): Promise<FileSystemFileStore> {
  const directory = await mkdtemp(join(tmpdir(), 'mba-desk-files-route-'))
  directories.push(directory)
  return new FileSystemFileStore({
    adapter: 'fs',
    directory,
    publicUrl: 'http://localhost',
    signingSecret: 'route-test-signing-secret',
  })
}
