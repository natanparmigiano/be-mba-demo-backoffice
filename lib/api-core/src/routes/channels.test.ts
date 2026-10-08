import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createChannelOverviewRoute,
  type ChannelOverviewRepository,
  type ChannelSummary,
} from './channels.js'

const channel: ChannelSummary = {
  id: 7,
  type: 'whatsapp',
  name: 'Support',
  waPhoneNumber: '15550001111',
  waPhoneNumberId: 'phone-id',
  waWabaId: 'waba-id',
  waBusinessId: 'business-id',
  waAppId: 'app-id',
  webhookForwardUrls: [],
  hasWaAppSecret: true,
  hasWaWebhookVerifyToken: true,
  hasWaSystemUserAccessToken: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function repository(): ChannelOverviewRepository {
  return {
    list: async () => [channel],
    create: async (_organizationId, input) => ({
      ...channel,
      ...input,
      id: 8,
      type: 'whatsapp',
      hasWaAppSecret: true,
      hasWaWebhookVerifyToken: true,
      hasWaSystemUserAccessToken: true,
    }),
    update: async (_organizationId, _channelId, input) => ({
      ...channel,
      ...input,
    }),
    getDeletionPreview: async () => ({
      confirmationText: channel.waPhoneNumber,
      contacts: 2,
      groups: 1,
      messages: 4,
      localMcpAssociations: 0,
      localMcps: 0,
    }),
    delete: async () => ({
      status: 'deleted',
      impact: {
        contacts: 2,
        groups: 1,
        messages: 4,
        localMcpAssociations: 0,
        localMcps: 0,
      },
    }),
    getVerifyToken: async () => 'verify-token',
    getWebhookConfiguration: async () => ({
      waAppId: 'app-id',
      waAppSecret: 'app-secret',
      waWebhookVerifyToken: 'verify-token',
    }),
    getAgentConfiguration: async () => undefined,
  }
}

describe('core channel routes', () => {
  it('allows organization owners to list, create, update, and delete channels', async () => {
    const app = createChannelOverviewRoute({
      getAccess: async () => ({ organizationId: 'org-1', role: 'owner' }),
      repository: repository(),
    })
    assert.equal((await app.request('/')).status, 200)
    assert.equal(
      (
        await app.request('/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Sales',
            waPhoneNumber: '15550002222',
            waPhoneNumberId: 'phone-2',
            waWabaId: 'waba-2',
            waBusinessId: 'business-2',
            waAppId: 'app-2',
            waAppSecret: 'secret',
            waWebhookVerifyToken: 'verify',
            waSystemUserAccessToken: 'token',
            webhookForwardUrls: [],
          }),
        })
      ).status,
      201,
    )
    assert.equal(
      (
        await app.request('/7', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Updated' }),
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await app.request('/7', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirmation: channel.waPhoneNumber }),
        })
      ).status,
      200,
    )
  })

  it('keeps channel mutations restricted to organization owners and admins', async () => {
    const app = createChannelOverviewRoute({
      getAccess: async () => ({ organizationId: 'org-1', role: 'member' }),
      repository: repository(),
    })
    const response = await app.request('/7', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    })
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })
})
