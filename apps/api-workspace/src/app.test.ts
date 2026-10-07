import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { app } from './app.js'

describe('workspace API surface', () => {
  it('exposes common health and workspace routes', async () => {
    assert.equal((await app.request('/api/health')).status, 200)
    assert.notEqual((await app.request('/api/chats')).status, 404)
  })

  it('does not expose manager routes or channel mutations', async () => {
    const managerRoute = await app.request('/api/runner/functions')
    const channelMutation = await app.request('/api/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    assert.equal(managerRoute.status, 404)
    assert.equal(channelMutation.status, 404)
    assert.deepEqual(await managerRoute.json(), { message: 'Not found' })
    assert.deepEqual(await channelMutation.json(), { message: 'Not found' })
  })
})
