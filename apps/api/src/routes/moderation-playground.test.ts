import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppModerationApiError,
  type WhatsAppModerationClientContract,
} from '@mba-demo/wa-moderation'
import {
  createModerationPlaygroundRoute,
  type ModerationPlaygroundRepository,
} from './moderation-playground.js'

const configuration = {
  phoneNumberId: 'phone-id',
  accessToken: 'secret-access-token',
}

describe('moderation playground route', () => {
  it('lists blocked users with pagination for a channel member', async () => {
    let options: Parameters<WhatsAppModerationClientContract['list']>[0]
    const result = {
      data: [{ messaging_product: 'whatsapp' as const, wa_id: '16505551234' }],
    }
    const route = createModerationPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createModerationClient: () =>
        createClient({
          list: async (value) => {
            options = value
            return result
          },
        }),
    })

    const response = await route.request(
      '/7?limit=50&before=before-cursor&after=after-cursor',
    )

    assert.equal(response.status, 200)
    assert.deepEqual(
      { ...options, signal: options?.signal instanceof AbortSignal },
      {
        limit: 50,
        before: 'before-cursor',
        after: 'after-cursor',
        signal: true,
      },
    )
    assert.deepEqual(await response.json(), { result })
  })

  it('blocks and unblocks users for an organization manager', async () => {
    const calls: Array<{ operation: string; users: string[] }> = []
    const route = createModerationPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      createModerationClient: () =>
        createClient({
          block: async (users) => {
            calls.push({ operation: 'block', users })
            return {
              messaging_product: 'whatsapp',
              block_users: { added_users: [] },
            }
          },
          unblock: async (users) => {
            calls.push({ operation: 'unblock', users })
            return {
              messaging_product: 'whatsapp',
              block_users: { removed_users: [] },
            }
          },
        }),
    })

    for (const operation of ['block', 'unblock']) {
      const response = await route.request(`/7/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ users: ['+16505551234', '+14155559876'] }),
      })
      assert.equal(response.status, 200)
    }

    assert.deepEqual(calls, [
      {
        operation: 'block',
        users: ['+16505551234', '+14155559876'],
      },
      {
        operation: 'unblock',
        users: ['+16505551234', '+14155559876'],
      },
    ])
  })

  it('blocks member mutations before resolving channel credentials', async () => {
    let repositoryCalled = false
    const route = createModerationPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      }),
    })

    const response = await route.request('/7/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ users: ['+16505551234'] }),
    })

    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
  })

  it('validates moderation inputs at the API boundary', async () => {
    const route = createModerationPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
    })

    const invalidLimit = await route.request('/7?limit=0')
    const emptyUsers = await route.request('/7/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ users: [] }),
    })

    assert.equal(invalidLimit.status, 400)
    assert.equal(emptyUsers.status, 400)
  })

  it('does not expose another organization channel', async () => {
    const route = createModerationPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({ getConfiguration: async () => undefined }),
    })

    const response = await route.request('/99')
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Channel not found' })
  })

  it('maps provider errors without exposing channel credentials', async () => {
    const route = createModerationPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createModerationClient: () =>
        createClient({
          list: async () => {
            throw new WhatsAppModerationApiError(400, {
              error: { message: 'Invalid request', code: 100 },
            })
          },
        }),
    })

    const response = await route.request('/7')
    const body = await response.text()
    assert.equal(response.status, 502)
    assert.match(body, /Invalid request/)
    assert.match(body, /"providerCode":100/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

function createRepository(
  overrides: Partial<ModerationPlaygroundRepository> = {},
): ModerationPlaygroundRepository {
  return { getConfiguration: async () => configuration, ...overrides }
}

function createClient(
  overrides: Partial<WhatsAppModerationClientContract> = {},
): WhatsAppModerationClientContract {
  return {
    list: async () => ({ data: [] }),
    block: async () => ({
      messaging_product: 'whatsapp',
      block_users: { added_users: [] },
    }),
    unblock: async () => ({
      messaging_product: 'whatsapp',
      block_users: { removed_users: [] },
    }),
    ...overrides,
  }
}
