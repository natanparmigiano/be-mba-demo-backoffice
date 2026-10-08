import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { app, createManagerApp } from './app.js'

describe('API', () => {
  it('reports its health', async () => {
    const response = await app.request('/api/health')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'ok',
      runtime: 'node',
    })
  })

  it('mounts the Better Auth handler', async () => {
    const response = await app.request('/api/auth/get-session')

    assert.equal(response.status, 200)
    assert.equal(await response.json(), null)
  })

  it('reports SSO availability without exposing provider details', async () => {
    const enabledApp = createManagerApp({ hasSsoProviders: async () => true })
    const disabledApp = createManagerApp({ hasSsoProviders: async () => false })

    const enabledResponse = await enabledApp.request(
      '/api/auth/sso-availability',
    )
    const disabledResponse = await disabledApp.request(
      '/api/auth/sso-availability',
    )

    assert.equal(enabledResponse.status, 200)
    assert.deepEqual(await enabledResponse.json(), { enabled: true })
    assert.equal(disabledResponse.status, 200)
    assert.deepEqual(await disabledResponse.json(), { enabled: false })
  })

  it('serves the frontend with SPA fallback without masking API 404s', async () => {
    const staticApp = createManagerApp({ webRoot: '../web-manager' })
    const pageResponse = await staticApp.request('/dashboard')
    const apiResponse = await staticApp.request('/api/missing')

    assert.equal(pageResponse.status, 200)
    assert.match(await pageResponse.text(), /<title>MBA Desk<\/title>/)
    assert.equal(apiResponse.status, 404)
    assert.deepEqual(await apiResponse.json(), { message: 'Not found' })
  })

  it('does not expose workspace-only routes', async () => {
    const response = await app.request('/api/chats')
    const webhookResponse = await app.request('/api/wa-cloud/webhook/123')

    assert.equal(response.status, 404)
    assert.equal(webhookResponse.status, 404)
    assert.deepEqual(await response.json(), { message: 'Not found' })
  })
})
