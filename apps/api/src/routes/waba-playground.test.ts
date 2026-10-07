import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppWabaApiError,
  type ListWabasOptions,
  type WhatsAppWabaClientContract,
} from '@mba-desk/wa-waba'
import {
  createWabaPlaygroundRoute,
  type WabaPlaygroundRepository,
} from './waba-playground.js'

const configuration = { accessToken: 'secret-access-token' }

describe('WABA playground route', () => {
  it('gets a WABA for a channel member', async () => {
    let receivedId: string | undefined
    const route = createWabaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository(),
      createWabaClient: () =>
        createClient({
          get: async (wabaId, options) => {
            receivedId = wabaId
            assert.ok(options?.signal instanceof AbortSignal)
            return { id: wabaId, name: 'Demo account' }
          },
        }),
    })

    const response = await route.request('/7/accounts/waba-123')

    assert.equal(response.status, 200)
    assert.equal(receivedId, 'waba-123')
    assert.deepEqual(await response.json(), {
      result: { id: 'waba-123', name: 'Demo account' },
    })
  })

  it('lists owned and shared WABAs with pagination', async () => {
    const calls: Array<{
      operation: string
      businessId: string
      options?: ListWabasOptions
    }> = []
    const route = createWabaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository(),
      createWabaClient: () =>
        createClient({
          listOwned: async (businessId, options) => {
            calls.push({ operation: 'owned', businessId, options })
            return { data: [{ id: 'owned-waba' }] }
          },
          listShared: async (businessId, options) => {
            calls.push({ operation: 'shared', businessId, options })
            return { data: [{ id: 'shared-waba' }] }
          },
        }),
    })

    for (const kind of ['owned', 'shared']) {
      const response = await route.request(
        `/7/businesses/business-123/${kind}?limit=50&before=before&after=after`,
      )
      assert.equal(response.status, 200)
    }

    assert.deepEqual(
      calls.map(({ operation, businessId, options }) => ({
        operation,
        businessId,
        ...options,
        signal: options?.signal instanceof AbortSignal,
      })),
      [
        {
          operation: 'owned',
          businessId: 'business-123',
          limit: 50,
          before: 'before',
          after: 'after',
          signal: true,
        },
        {
          operation: 'shared',
          businessId: 'business-123',
          limit: 50,
          before: 'before',
          after: 'after',
          signal: true,
        },
      ],
    )
  })

  it('validates IDs and pagination at the API boundary', async () => {
    const route = createWabaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository(),
    })

    assert.equal((await route.request('/0/accounts/waba')).status, 400)
    assert.equal(
      (await route.request('/7/businesses/business/owned?limit=0')).status,
      400,
    )
  })

  it('does not expose another organization channel', async () => {
    const route = createWabaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository({ getConfiguration: async () => undefined }),
    })

    const response = await route.request('/99/accounts/waba')
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Channel not found' })
  })

  it('maps provider errors without exposing credentials', async () => {
    const route = createWabaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: createRepository(),
      createWabaClient: () =>
        createClient({
          get: async () => {
            throw new WhatsAppWabaApiError(400, {
              error: { message: 'Invalid request', code: 100 },
            })
          },
        }),
    })

    const response = await route.request('/7/accounts/waba')
    const body = await response.text()
    assert.equal(response.status, 502)
    assert.match(body, /Invalid request/)
    assert.match(body, /"providerCode":100/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

function createRepository(
  overrides: Partial<WabaPlaygroundRepository> = {},
): WabaPlaygroundRepository {
  return { getConfiguration: async () => configuration, ...overrides }
}

function createClient(
  overrides: Partial<WhatsAppWabaClientContract> = {},
): WhatsAppWabaClientContract {
  return {
    get: async (wabaId) => ({ id: wabaId }),
    listOwned: async () => ({ data: [] }),
    listShared: async () => ({ data: [] }),
    ...overrides,
  }
}
