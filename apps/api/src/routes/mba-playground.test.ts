import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppMbaClientContract } from '@mba-demo/wa-mba'
import {
  createMbaPlaygroundRoute,
  type MbaPlaygroundRepository,
} from './mba-playground.js'

const configuration = {
  accessToken: 'secret-token',
  phoneNumberId: 'phone-id',
  businessId: 'business-id',
}
const repository: MbaPlaygroundRepository = {
  getConfiguration: async () => configuration,
}

describe('MBA playground route', () => {
  it('allows members to run read operations with JSON arguments and options', async () => {
    let received: unknown[] = []
    const route = createMbaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
      createMbaClient: (actual) => {
        assert.deepEqual(actual, configuration)
        return {
          getConnector: async (...args: unknown[]) => {
            received = args
            return { id: 'connector-one' }
          },
        } as unknown as WhatsAppMbaClientContract
      },
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'getConnector',
        arguments: ['connector-one'],
        options: {},
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(received[0], 'connector-one')
    assert.ok(
      (received[1] as { signal?: unknown }).signal instanceof AbortSignal,
    )
  })

  it('blocks members from mutations before loading channel credentials', async () => {
    let repositoryCalled = false
    const route = createMbaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: {
        getConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      },
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'deleteAgent' }),
    })
    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
  })

  it('allows organization admins to run mutations', async () => {
    let called = false
    const route = createMbaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository,
      createMbaClient: () =>
        ({
          updateSettings: async () => {
            called = true
            return {
              agent_id: 'agent-one',
              channel: 'WHATSAPP',
              rollout: { enabled: true },
            }
          },
        }) as unknown as WhatsAppMbaClientContract,
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'updateSettings',
        arguments: [{ rollout: { enabled: true } }],
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(called, true)
  })

  it('forwards three positional arguments for connector tool updates', async () => {
    let received: unknown[] = []
    const route = createMbaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository,
      createMbaClient: () =>
        ({
          updateConnectorTool: async (...args: unknown[]) => {
            received = args
            return { id: 'tool-one' }
          },
        }) as unknown as WhatsAppMbaClientContract,
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'updateConnectorTool',
        arguments: ['connector-one', 'tool-one', { name: 'Updated tool' }],
      }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(received.slice(0, 3), [
      'connector-one',
      'tool-one',
      { name: 'Updated tool' },
    ])
    assert.ok(
      (received[3] as { signal?: unknown }).signal instanceof AbortSignal,
    )
  })

  it('rejects unknown operations at the boundary', async () => {
    const route = createMbaPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository,
    })
    const response = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stealCredentials' }),
    })
    assert.equal(response.status, 400)
  })
})
