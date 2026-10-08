import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppQrApiError,
  type WhatsAppQrClientContract,
} from '@mba-desk/wa-qr'
import {
  createQrPlaygroundRoute,
  type QrPlaygroundRepository,
} from './qr-playground.js'

const configuration = {
  phoneNumberId: 'phone-id',
  accessToken: 'secret-access-token',
}

const qrCode = {
  code: 'QR123',
  prefilled_message: 'Tell me more',
  deep_link_url: 'https://wa.me/message/QR123',
}

describe('QR playground route', () => {
  it('lists QR codes with selected fields and pagination for a member', async () => {
    let requestedOrganizationId: string | undefined
    let requestedChannelId: number | undefined
    let requestedOptions: Parameters<WhatsAppQrClientContract['list']>[0]
    let receivedConfiguration: typeof configuration | undefined
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getConfiguration: async (organizationId, channelId) => {
          requestedOrganizationId = organizationId
          requestedChannelId = channelId
          return configuration
        },
      }),
      createQrClient: (value) => {
        receivedConfiguration = value
        return createClient({
          list: async (options) => {
            requestedOptions = options
            return { data: [qrCode] }
          },
        })
      },
    })

    const response = await route.request(
      '/7?fields=code,prefilled_message,code&imageFormat=SVG&limit=25&before=before&after=after',
    )

    assert.equal(response.status, 200)
    assert.equal(requestedOrganizationId, 'org-one')
    assert.equal(requestedChannelId, 7)
    assert.deepEqual(receivedConfiguration, configuration)
    assert.deepEqual(
      {
        ...requestedOptions,
        signal: requestedOptions?.signal instanceof AbortSignal,
      },
      {
        fields: ['code', 'prefilled_message'],
        imageFormat: 'SVG',
        limit: 25,
        before: 'before',
        after: 'after',
        signal: true,
      },
    )
    assert.deepEqual(await response.json(), { result: { data: [qrCode] } })
  })

  it('dispatches single-code reads through the selected channel client', async () => {
    const calls: Array<{ operation: string; code: string; format?: string }> =
      []
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createQrClient: () =>
        createClient({
          get: async (code) => {
            calls.push({ operation: 'get', code })
            return qrCode
          },
          getImageUrl: async (code, format) => {
            calls.push({ operation: 'image', code, format })
            return { ...qrCode, qr_image_url: 'https://cdn.test/qr.svg' }
          },
        }),
    })

    const getResponse = await route.request('/7/QR123')
    const imageResponse = await route.request('/7/QR123/image?format=SVG')

    assert.equal(getResponse.status, 200)
    assert.equal(imageResponse.status, 200)
    assert.deepEqual(calls, [
      { operation: 'get', code: 'QR123' },
      { operation: 'image', code: 'QR123', format: 'SVG' },
    ])
  })

  it('dispatches create, update, and delete for an organization manager', async () => {
    const calls: Array<{ operation: string; input?: unknown }> = []
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      createQrClient: () =>
        createClient({
          create: async (input) => {
            calls.push({ operation: 'create', input })
            return { ...qrCode, qr_image_url: 'https://cdn.test/qr.png' }
          },
          update: async (code, input) => {
            calls.push({ operation: 'update', input: { code, ...input } })
            return { ...qrCode, prefilled_message: input.prefilled_message }
          },
          delete: async (code) => {
            calls.push({ operation: 'delete', input: { code } })
            return { success: true }
          },
        }),
    })

    const requests: Array<[string, string, object | undefined]> = [
      ['/7', 'POST', { prefilledMessage: 'Tell me more', imageFormat: 'PNG' }],
      ['/7/QR123', 'POST', { prefilledMessage: 'Show me offers' }],
      ['/7/QR123', 'DELETE', undefined],
    ]

    for (const [path, method, body] of requests) {
      const response = await route.request(path, {
        method,
        ...(body
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      })
      assert.equal(response.status, 200)
    }

    assert.deepEqual(calls, [
      {
        operation: 'create',
        input: {
          prefilled_message: 'Tell me more',
          generate_qr_image: 'PNG',
        },
      },
      {
        operation: 'update',
        input: { code: 'QR123', prefilled_message: 'Show me offers' },
      },
      { operation: 'delete', input: { code: 'QR123' } },
    ])
  })

  it('blocks member mutations before resolving channel credentials', async () => {
    let repositoryCalled = false
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      }),
    })

    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefilledMessage: 'Tell me more' }),
    })

    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
  })

  it('validates QR inputs at the API boundary', async () => {
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
    })

    const invalidFormat = await route.request('/7/QR123/image?format=GIF')
    const invalidFields = await route.request('/7?fields=code,unknown_field')
    const emptyMessage = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefilledMessage: ' ' }),
    })

    assert.equal(invalidFormat.status, 400)
    assert.equal(invalidFields.status, 400)
    assert.equal(emptyMessage.status, 400)
  })

  it('does not expose another organization channel', async () => {
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getConfiguration: async () => undefined,
      }),
    })

    const response = await route.request('/99')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Channel not found' })
  })

  it('maps provider errors without exposing channel credentials', async () => {
    const route = createQrPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createQrClient: () =>
        createClient({
          get: async () => {
            throw new WhatsAppQrApiError(404, {
              error: { message: 'QR code not found', code: 100 },
            })
          },
        }),
    })

    const response = await route.request('/7/missing')
    const body = await response.text()

    assert.equal(response.status, 502)
    assert.match(body, /QR code not found/)
    assert.match(body, /"providerCode":100/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

function createRepository(
  overrides: Partial<QrPlaygroundRepository> = {},
): QrPlaygroundRepository {
  return {
    getConfiguration: async () => configuration,
    ...overrides,
  }
}

function createClient(
  overrides: Partial<WhatsAppQrClientContract> = {},
): WhatsAppQrClientContract {
  return {
    create: async () => qrCode,
    get: async () => qrCode,
    getImageUrl: async () => ({
      ...qrCode,
      qr_image_url: 'https://cdn.test/qr.svg',
    }),
    list: async () => ({ data: [qrCode] }),
    update: async () => qrCode,
    delete: async () => ({ success: true }),
    ...overrides,
  }
}
