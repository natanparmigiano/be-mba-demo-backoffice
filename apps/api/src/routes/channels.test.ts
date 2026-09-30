import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createChannelManagementRoute,
  overrideMetaWebhook,
} from './channels.js'
import type { ChannelManagementRepository, ChannelSummary } from './channels.js'

const channel: ChannelSummary = {
  id: 7,
  type: 'whatsapp',
  waPhoneNumber: '+55 11 99999-0000',
  waPhoneNumberId: 'phone-id',
  waWabaId: 'waba-id',
  waBusinessId: 'business-id',
  waAppId: 'app-id',
  hasWaAppSecret: true,
  hasWaWebhookVerifyToken: true,
  hasWaSystemUserAccessToken: true,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
}

describe('channel management route', () => {
  it('lists only safe channel fields for the active organization', async () => {
    let listedOrganizationId: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository({
        list: async (organizationId) => {
          listedOrganizationId = organizationId
          return [channel]
        },
      }),
    })

    const response = await route.request('/')
    const body: unknown = await response.json()

    assert.equal(response.status, 200)
    assert.equal(listedOrganizationId, 'org-one')
    assert.deepEqual(body, { channels: [channel] })
    assert.equal(JSON.stringify(body).includes('app-secret'), false)
    assert.equal(JSON.stringify(body).includes('access-token'), false)
  })

  it('allows organization admins to create a scoped channel', async () => {
    let createdOrganizationId: string | undefined
    const repository = createRepository({
      create: async (organizationId) => {
        createdOrganizationId = organizationId
        return channel
      },
    })
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-two', role: 'admin' }),
      repository,
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createChannelInput()),
    })

    assert.equal(response.status, 201)
    assert.equal(createdOrganizationId, 'org-two')
  })

  it('prevents regular members from mutating channels', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: createRepository(),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createChannelInput()),
    })

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      message: 'Organization owner or admin required',
    })
  })

  it('reveals a verify token only to organization managers', async () => {
    let requestedOrganizationId: string | undefined
    const repository = createRepository({
      getVerifyToken: async (organizationId) => {
        requestedOrganizationId = organizationId
        return 'verify-secret'
      },
    })
    const managerRoute = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository,
    })
    const memberRoute = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
    })

    const managerResponse = await managerRoute.request('/7/verify-token')
    const memberResponse = await memberRoute.request('/7/verify-token')

    assert.equal(managerResponse.status, 200)
    assert.deepEqual(await managerResponse.json(), { token: 'verify-secret' })
    assert.equal(requestedOrganizationId, 'org-one')
    assert.equal(memberResponse.status, 403)
  })

  it('sets the stored channel webhook override for an organization manager', async () => {
    let requestedCallbackUrl: string | undefined
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: createRepository(),
      setWebhookOverride: async (_configuration, callbackUrl) => {
        requestedCallbackUrl = callbackUrl
      },
    })

    const callbackUrl = 'https://example.com/api/wa-cloud/webhook/7'
    const response = await route.request('/7/set-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callbackUrl }),
    })

    assert.equal(response.status, 200)
    assert.equal(requestedCallbackUrl, callbackUrl)
    assert.deepEqual(await response.json(), {
      success: true,
      message: 'Meta webhook override updated successfully',
      callbackUrl,
    })
  })

  it('rejects a callback URL that does not belong to the channel', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository(),
    })

    const response = await route.request('/7/set-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'https://example.com/api/wa-cloud/webhook/8',
      }),
    })

    assert.equal(response.status, 400)
  })

  it('returns not found instead of touching another organization channel', async () => {
    const route = createChannelManagementRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: createRepository({ update: async () => undefined }),
    })

    const response = await route.request('/99', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ waPhoneNumber: '+1 555 000 9999' }),
    })

    assert.equal(response.status, 404)
  })
})

describe('Meta webhook override', () => {
  it('sends the collection request shape without leaking credentials', async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      requestInit = init
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as typeof fetch

    await overrideMetaWebhook(
      {
        waWabaId: 'waba-id',
        waWebhookVerifyToken: 'verify-secret',
        waSystemUserAccessToken: 'access-secret',
      },
      'https://example.com/api/wa-cloud/webhook/7',
      request,
    )

    assert.equal(
      requestUrl,
      'https://graph.facebook.com/v26.0/waba-id/subscribed_apps',
    )
    assert.equal(requestInit?.method, 'POST')
    assert.equal(
      new Headers(requestInit?.headers).get('authorization'),
      'Bearer access-secret',
    )
    const rawRequestBody = requestInit?.body
    assert.equal(typeof rawRequestBody, 'string')
    if (typeof rawRequestBody !== 'string') throw new Error('Missing JSON body')
    const requestBody: unknown = JSON.parse(rawRequestBody)
    assert.deepEqual(requestBody, {
      override_callback_uri: 'https://example.com/api/wa-cloud/webhook/7',
      verify_token: 'verify-secret',
    })
  })
})

function createRepository(
  overrides: Partial<ChannelManagementRepository> = {},
): ChannelManagementRepository {
  return {
    list: async () => [],
    getVerifyToken: async () => 'verify-secret',
    getWebhookConfiguration: async () => ({
      waWabaId: 'waba-id',
      waWebhookVerifyToken: 'verify-secret',
      waSystemUserAccessToken: 'access-secret',
    }),
    create: async () => channel,
    update: async () => channel,
    delete: async () => true,
    ...overrides,
  }
}

function createChannelInput() {
  return {
    waPhoneNumber: '+55 11 99999-0000',
    waPhoneNumberId: 'phone-id',
    waWabaId: 'waba-id',
    waBusinessId: 'business-id',
    waAppId: 'app-id',
    waAppSecret: 'app-secret',
    waWebhookVerifyToken: 'verify-token',
    waSystemUserAccessToken: 'access-token',
  }
}
