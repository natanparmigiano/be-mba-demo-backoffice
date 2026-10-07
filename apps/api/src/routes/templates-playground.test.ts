import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WhatsAppTemplatesClientContract } from '@mba-desk/wa-templates'
import {
  createTemplatesPlaygroundRoute,
  type TemplatesPlaygroundRepository,
} from './templates-playground.js'

const configuration = { wabaId: 'waba-id', accessToken: 'secret-token' }
const repository: TemplatesPlaygroundRepository = {
  getConfiguration: async () => configuration,
}

describe('templates playground route', () => {
  it('lists templates for a member using the selected channel WABA', async () => {
    let options: Parameters<WhatsAppTemplatesClientContract['list']>[0]
    const route = createTemplatesPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
      createTemplatesClient: (received) => {
        assert.deepEqual(received, configuration)
        return {
          list: async (value) => {
            options = value
            return { data: [{ id: 'template-one', name: 'order_ready' }] }
          },
        } as WhatsAppTemplatesClientContract
      },
    })

    const response = await route.request(
      '/7?name=order_ready&fields=id,name,id&limit=25',
    )

    assert.equal(response.status, 200)
    assert.deepEqual(
      { ...options, signal: options?.signal instanceof AbortSignal },
      {
        name: 'order_ready',
        fields: ['id', 'name'],
        limit: 25,
        signal: true,
      },
    )
  })

  it('blocks member mutations before resolving channel credentials', async () => {
    let repositoryCalled = false
    const route = createTemplatesPlaygroundRoute({
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
      body: JSON.stringify({
        input: {
          name: 'order_ready',
          language: 'en_US',
          category: 'UTILITY',
          components: [],
        },
      }),
    })

    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
  })
})
