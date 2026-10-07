import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppMediaApiError,
  type UploadMediaInput,
  type WhatsAppMediaClientContract,
} from '@mba-desk/wa-media'
import {
  createMediaPlaygroundRoute,
  type MediaPlaygroundRepository,
} from './media-playground.js'

const configuration = {
  phoneNumberId: 'phone-id',
  accessToken: 'secret-access-token',
}

const metadata = {
  messaging_product: 'whatsapp' as const,
  url: 'https://lookaside.example/media',
  mime_type: 'image/png',
  sha256: 'sha256-value',
  file_size: 3,
  id: 'media-123',
}

describe('media playground route', () => {
  it('uploads validated media through the selected organization channel', async () => {
    let requestedOrganizationId: string | undefined
    let requestedChannelId: number | undefined
    let uploaded: UploadMediaInput | undefined
    let receivedConfiguration: typeof configuration | undefined
    const route = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository({
        getConfiguration: async (organizationId, channelId) => {
          requestedOrganizationId = organizationId
          requestedChannelId = channelId
          return configuration
        },
      }),
      createMediaClient: (value) => {
        receivedConfiguration = value
        return createClient({
          upload: async (input) => {
            uploaded = input
            return { id: 'uploaded-media' }
          },
        })
      },
    })
    const form = new FormData()
    form.set('kind', 'image')
    form.set(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'photo.png', {
        type: 'image/png',
      }),
    )

    const response = await route.request('/7/upload', {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-one')
    assert.equal(requestedChannelId, 7)
    assert.deepEqual(receivedConfiguration, configuration)
    assert.equal(uploaded?.kind, 'image')
    assert.equal(uploaded?.filename, 'photo.png')
    assert.equal(uploaded?.mimeType, 'image/png')
    assert.deepEqual(await response.json(), {
      result: { id: 'uploaded-media' },
    })
  })

  it('rejects an unsupported MIME type before creating a provider client', async () => {
    let clientCreated = false
    const route = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      createMediaClient: () => {
        clientCreated = true
        return createClient()
      },
    })
    const form = new FormData()
    form.set('kind', 'image')
    form.set(
      'file',
      new File(['not-an-image'], 'payload.txt', { type: 'text/plain' }),
    )

    const response = await route.request('/7/upload', {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 400)
    assert.equal(clientCreated, false)
  })

  it('retrieves metadata and downloads media for an organization member', async () => {
    const calls: string[] = []
    const route = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createMediaClient: () =>
        createClient({
          getMediaUrl: async (mediaId) => {
            calls.push(`metadata:${mediaId}`)
            return metadata
          },
          download: async (url) => {
            calls.push(`download:${String(url)}`)
            return {
              data: new Uint8Array([1, 2, 3]),
              contentType: 'image/png',
              contentLength: 3,
              contentDisposition: null,
            }
          },
        }),
    })

    const metadataResponse = await route.request('/7/media-123')
    const downloadResponse = await route.request('/7/media-123/download')

    assert.equal(metadataResponse.status, 200)
    assert.deepEqual(await metadataResponse.json(), { result: metadata })
    assert.equal(downloadResponse.status, 200)
    assert.equal(downloadResponse.headers.get('content-type'), 'image/png')
    assert.equal(
      downloadResponse.headers.get('cache-control'),
      'private, no-store',
    )
    assert.equal(
      downloadResponse.headers.get('content-disposition'),
      'attachment; filename="media-123"',
    )
    assert.deepEqual(
      new Uint8Array(await downloadResponse.arrayBuffer()),
      new Uint8Array([1, 2, 3]),
    )
    assert.deepEqual(calls, [
      'metadata:media-123',
      'metadata:media-123',
      `download:${metadata.url}`,
    ])
  })

  it('deletes media for an owner and blocks member mutations', async () => {
    const deleted: string[] = []
    const ownerRoute = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
      createMediaClient: () =>
        createClient({
          delete: async (mediaId) => {
            deleted.push(mediaId)
            return { success: true }
          },
        }),
    })
    const memberRoute = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })
    const form = new FormData()
    form.set('kind', 'image')
    form.set(
      'file',
      new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }),
    )

    const deleteResponse = await ownerRoute.request('/7/media-123', {
      method: 'DELETE',
    })
    const uploadResponse = await memberRoute.request('/7/upload', {
      method: 'POST',
      body: form,
    })

    assert.equal(deleteResponse.status, 200)
    assert.deepEqual(await deleteResponse.json(), {
      result: { success: true },
    })
    assert.deepEqual(deleted, ['media-123'])
    assert.equal(uploadResponse.status, 403)
  })

  it('does not expose another organization channel', async () => {
    const route = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getConfiguration: async () => undefined,
      }),
    })

    const response = await route.request('/99/media-123')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Channel not found' })
  })

  it('maps provider errors without exposing channel credentials', async () => {
    const route = createMediaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createMediaClient: () =>
        createClient({
          getMediaUrl: async () => {
            throw new WhatsAppMediaApiError(404, {
              error: { message: 'Media not found', code: 100 },
            })
          },
        }),
    })

    const response = await route.request('/7/media-123')
    const body = await response.text()

    assert.equal(response.status, 502)
    assert.match(body, /Media not found/)
    assert.match(body, /"providerCode":100/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

function createRepository(
  overrides: Partial<MediaPlaygroundRepository> = {},
): MediaPlaygroundRepository {
  return {
    getConfiguration: async () => configuration,
    ...overrides,
  }
}

function createClient(
  overrides: Partial<WhatsAppMediaClientContract> = {},
): WhatsAppMediaClientContract {
  return {
    upload: async () => ({ id: 'uploaded-media' }),
    uploadAudio: async () => ({ id: 'uploaded-media' }),
    uploadDocument: async () => ({ id: 'uploaded-media' }),
    uploadImage: async () => ({ id: 'uploaded-media' }),
    uploadSticker: async () => ({ id: 'uploaded-media' }),
    uploadVideo: async () => ({ id: 'uploaded-media' }),
    getMediaUrl: async () => metadata,
    download: async () => ({
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
      contentLength: 3,
      contentDisposition: null,
    }),
    delete: async () => ({ success: true }),
    ...overrides,
  }
}
