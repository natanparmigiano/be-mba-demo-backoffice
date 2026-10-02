import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWebhooksRoute } from './webhooks.js'

describe('webhooks route', () => {
  it('requires active organization access', async () => {
    const route = createWebhooksRoute({ getAccess: async () => undefined })
    const response = await route.request('/')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { message: 'Unauthorized' })
  })

  it('rejects malformed pagination cursors before querying storage', async () => {
    const route = createWebhooksRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
    })
    const response = await route.request('/?cursor=not-a-cursor')
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: 'Invalid cursor' })
  })

  it('requires channel and time bounds for JSONL exports', async () => {
    const route = createWebhooksRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
    })
    const response = await route.request('/export?channelId=42')
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      message: 'Invalid webhook export query',
    })
  })
})
