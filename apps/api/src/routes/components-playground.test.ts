import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppComponentsClientContract } from '@mba-demo/wa-components'
import {
  createComponentsPlaygroundRoute,
  type ComponentsPlaygroundRepository,
} from './components-playground.js'

const configuration = {
  phoneNumberId: 'phone-id',
  accessToken: 'secret-access-token',
}

describe('components playground route', () => {
  it('reads components for a channel member', async () => {
    const result = {
      prompts: ['Track my order'],
      commands: [
        { command_name: 'catalog', command_description: 'Browse products' },
      ],
    }
    const route = createComponentsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
      createComponentsClient: () =>
        createClient({ getConfiguration: async () => result }),
    })

    const response = await route.request('/7')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { result })
  })

  it('sets components for a manager', async () => {
    const calls: unknown[] = []
    const route = createComponentsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      createComponentsClient: () =>
        createClient({
          setConfiguration: async (input) => {
            calls.push(input)
            return { success: true }
          },
        }),
    })

    const update = await route.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompts: ['Talk to sales'],
        commands: [
          { commandName: 'catalog', commandDescription: 'Browse products' },
        ],
      }),
    })
    assert.equal(update.status, 200)
    assert.deepEqual(calls, [
      {
        prompts: ['Talk to sales'],
        commands: [
          { command_name: 'catalog', command_description: 'Browse products' },
        ],
      },
    ])
  })

  it('blocks member mutations and validates inputs', async () => {
    let repositoryCalled = false
    const memberRoute = createComponentsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        getConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      }),
    })
    const forbidden = await memberRoute.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompts: ['Hello'] }),
    })
    assert.equal(forbidden.status, 403)
    assert.equal(repositoryCalled, false)

    const managerRoute = createComponentsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
    })
    const invalid = await managerRoute.request('/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompts: Array.from({ length: 5 }, () => 'Hi') }),
    })
    assert.equal(invalid.status, 400)
  })
})

function createRepository(
  overrides: Partial<ComponentsPlaygroundRepository> = {},
): ComponentsPlaygroundRepository {
  return {
    getConfiguration: async () => configuration,
    ...overrides,
  }
}

function createClient(
  overrides: Partial<WhatsAppComponentsClientContract> = {},
): WhatsAppComponentsClientContract {
  return {
    getConfiguration: async () => ({}),
    setConfiguration: async () => ({ success: true }),
    ...overrides,
  }
}
