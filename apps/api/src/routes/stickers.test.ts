import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FileStore } from '@mba-demo/files'
import {
  createStickersRoute,
  type StickerLibraryItem,
  type StickerLibraryRepository,
} from './stickers.js'

const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
])

describe('sticker library route', () => {
  it('stores WebP stickers in the active organization and serves them', async () => {
    const storedFiles = new Map<string, Uint8Array>()
    let createdOrganizationId: string | undefined
    const repository = createRepository({
      create: async (input) => {
        createdOrganizationId = input.organizationId
        return {
          id: 7,
          byteSize: input.byteSize,
          createdAt: '2026-10-02T12:00:00.000Z',
          storagePath: input.storagePath,
        }
      },
      get: async (organizationId, stickerId) =>
        organizationId === 'org-one' && stickerId === 7
          ? {
              id: 7,
              byteSize: WEBP.length,
              createdAt: '2026-10-02T12:00:00.000Z',
              storagePath: 'stickers/org-one/sticker.webp',
            }
          : undefined,
    })
    const fileStore = createFileStore(storedFiles)
    const route = createStickersRoute({
      fileStore,
      repository,
      getAccess: async () => ({ organizationId: 'org-one' }),
    })

    const created = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'image/webp' },
      body: WEBP,
    })
    assert.equal(created.status, 201)
    assert.equal(createdOrganizationId, 'org-one')
    assert.equal(storedFiles.size, 1)

    storedFiles.set('stickers/org-one/sticker.webp', WEBP)
    const content = await route.request('/7/content')
    assert.equal(content.status, 200)
    assert.equal(content.headers.get('content-type'), 'image/webp')
    assert.deepEqual(new Uint8Array(await content.arrayBuffer()), WEBP)
  })

  it('rejects bodies that only claim to be WebP', async () => {
    const route = createStickersRoute({
      fileStore: createFileStore(new Map()),
      repository: createRepository(),
      getAccess: async () => ({ organizationId: 'org-one' }),
    })
    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'image/webp' },
      body: new Uint8Array([1, 2, 3]),
    })
    assert.equal(response.status, 400)
  })
})

function createRepository(
  overrides: Partial<StickerLibraryRepository> = {},
): StickerLibraryRepository {
  const item: StickerLibraryItem & { storagePath: string } = {
    id: 1,
    byteSize: WEBP.length,
    createdAt: '2026-10-02T12:00:00.000Z',
    storagePath: 'stickers/org-one/default.webp',
  }
  return {
    list: async () => [],
    get: async () => item,
    findByHash: async () => undefined,
    create: async () => item,
    ...overrides,
  }
}

function createFileStore(files: Map<string, Uint8Array>): FileStore {
  return {
    mode: 'fs',
    get: async (key) => {
      const body = files.get(key)
      return body
        ? { body, contentType: 'image/webp', size: body.length }
        : null
    },
    put: async (key, body) => {
      files.set(key, body)
    },
    delete: async (key) => {
      files.delete(key)
    },
    signUrl: async () => 'https://example.test/signed',
    close: async () => undefined,
  }
}
