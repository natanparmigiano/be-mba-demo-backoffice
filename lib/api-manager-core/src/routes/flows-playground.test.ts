import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppFlowsClientContract } from '@mba-desk/wa-flows'
import { createFlowsPlaygroundRoute } from './flows-playground.js'

const configuration = {
  wabaId: 'waba-id',
  phoneNumberId: 'phone-id',
  accessToken: 'secret',
}
const repository = { getConfiguration: async () => configuration }

describe('Flows playground route', () => {
  it('lets members run read operations with channel-scoped credentials', async () => {
    const route = createFlowsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
      createFlowsClient: () =>
        client({ list: async () => ({ data: [{ id: 'flow-1' }] }) }),
    })
    const response = await request(route, {
      action: 'list',
      input: { limit: 10 },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      result: { data: [{ id: 'flow-1' }] },
    })
  })

  it('dispatches mutations for managers and blocks members', async () => {
    const calls: unknown[] = []
    const manager = createFlowsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository,
      createFlowsClient: () =>
        client({
          create: async (input) => {
            calls.push(input)
            return { id: 'flow-1' }
          },
        }),
    })
    const created = await request(manager, {
      action: 'create',
      input: { name: 'Survey', categories: ['SURVEY'] },
    })
    assert.equal(created.status, 200)
    assert.deepEqual(calls, [{ name: 'Survey', categories: ['SURVEY'] }])

    const member = createFlowsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
    })
    assert.equal(
      (await request(member, { action: 'publish', flowId: 'flow-1' })).status,
      403,
    )
  })
})

function request(
  route: ReturnType<typeof createFlowsPlaygroundRoute>,
  body: object,
) {
  return route.request('/7', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function client(
  overrides: Partial<WhatsAppFlowsClientContract> = {},
): WhatsAppFlowsClientContract {
  const success = async () => ({ success: true as const })
  return {
    create: async () => ({ id: 'flow-1' }),
    list: async () => ({ data: [] }),
    get: async (id) => ({ id }),
    getPreview: async (id) => ({
      id,
      preview: { preview_url: 'https://example.com', expires_at: 1 },
    }),
    migrate: async () => ({ migrated_flows: [], failed_flows: [] }),
    updateMetadata: success,
    uploadJson: async () => ({ success: true, validation_errors: [] }),
    listAssets: async () => ({ data: [] }),
    publish: success,
    deprecate: success,
    delete: success,
    getMetric: async (id, options) => ({
      id,
      metric: {
        name: options.name,
        granularity: options.granularity,
        data_points: [],
      },
    }),
    getEncryptionPublicKey: async () => ({ data: [] }),
    setEncryptionPublicKey: success,
    ...overrides,
  }
}
