import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
  WhatsAppSubscriptionsApiError,
  type WhatsAppSubscriptionsClientContract,
  type WhatsAppWebhookRegistrationClientContract,
} from '@mba-demo/wa-subscriptions'
import { createSubscriptionsPlaygroundRoute } from './subscriptions-playground.js'

const configuration = {
  appId: 'app-id',
  appSecret: 'app-secret',
  wabaId: 'waba-id',
  accessToken: 'secret-token',
}
const repository = { getConfiguration: async () => configuration }

describe('Subscriptions playground route', () => {
  it('lets members list channel-scoped subscriptions', async () => {
    let receivedConfiguration: typeof configuration | undefined
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
      createSubscriptionsClient: (value) => {
        receivedConfiguration = value
        return client({
          list: async () => ({
            data: [{ whatsapp_business_api_data: { id: 'app-1' } }],
          }),
        })
      },
    })
    const response = await route.request('/7')
    assert.equal(response.status, 200)
    assert.deepEqual(receivedConfiguration, configuration)
    assert.deepEqual(await response.json(), {
      result: {
        data: [{ whatsapp_business_api_data: { id: 'app-1' } }],
      },
    })
  })

  it('dispatches every mutation for organization managers', async () => {
    const calls: Array<{ operation: string; input?: unknown }> = []
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository,
      createSubscriptionsClient: () =>
        client({
          subscribe: async () => {
            calls.push({ operation: 'subscribe' })
            return { success: true }
          },
          overrideCallback: async (input) => {
            calls.push({ operation: 'override', input })
            return { data: [] }
          },
          unsubscribe: async () => {
            calls.push({ operation: 'unsubscribe' })
            return { success: true }
          },
        }),
    })
    const subscribe = await route.request('/7', { method: 'POST' })
    const override = await route.request('/7/override-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'https://example.com/webhook',
        verifyToken: 'verify-secret',
      }),
    })
    const unsubscribe = await route.request('/7', { method: 'DELETE' })
    assert.equal(subscribe.status, 200)
    assert.equal(override.status, 200)
    assert.equal(unsubscribe.status, 200)
    assert.deepEqual(calls, [
      { operation: 'subscribe' },
      {
        operation: 'override',
        input: {
          override_callback_uri: 'https://example.com/webhook',
          verify_token: 'verify-secret',
        },
      },
      { operation: 'unsubscribe' },
    ])
  })

  it('registers selected app fields and lists the active app registration', async () => {
    let registeredInput: unknown
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository,
      createRegistrationClient: () =>
        registrationClient({
          register: async (input) => {
            registeredInput = input
            return { success: true }
          },
          list: async () => ({
            data: [
              {
                object: 'whatsapp_business_account',
                fields: [{ name: 'messages', version: 'v26.0' }],
              },
            ],
          }),
        }),
    })

    const register = await route.request('/7/app-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'https://example.com/webhook',
        verifyToken: 'verify-secret',
        fields: ['messages', 'phone_number_quality_update'],
      }),
    })
    const list = await route.request('/7/app-registration')

    assert.equal(register.status, 200)
    assert.equal(list.status, 200)
    assert.deepEqual(registeredInput, {
      callbackUrl: 'https://example.com/webhook',
      verifyToken: 'verify-secret',
      fields: ['messages', 'phone_number_quality_update'],
    })
    assert.deepEqual(await list.json(), {
      result: {
        data: [
          {
            object: 'whatsapp_business_account',
            fields: [{ name: 'messages', version: 'v26.0' }],
          },
        ],
      },
    })
  })

  it('blocks member mutations before resolving credentials', async () => {
    let repositoryCalled = false
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: {
        getConfiguration: async () => {
          repositoryCalled = true
          return configuration
        },
      },
    })
    const response = await route.request('/7', { method: 'POST' })
    assert.equal(response.status, 403)
    assert.equal(repositoryCalled, false)
  })

  it('validates callback input at the API boundary', async () => {
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository,
    })
    const response = await route.request('/7/override-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'ftp://example.com',
        verifyToken: '',
      }),
    })
    assert.equal(response.status, 400)
    const appRegistration = await route.request('/7/app-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'https://example.com/webhook',
        verifyToken: 'secret',
        fields: ['not_a_real_field'],
      }),
    })
    assert.equal(appRegistration.status, 400)
    assert.ok(WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS.includes('messages'))
  })

  it('does not expose another organization channel', async () => {
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository: { getConfiguration: async () => undefined },
    })
    const response = await route.request('/99')
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { message: 'Channel not found' })
  })

  it('maps provider errors without exposing credentials', async () => {
    const route = createSubscriptionsPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      repository,
      createSubscriptionsClient: () =>
        client({
          list: async () => {
            throw new WhatsAppSubscriptionsApiError(400, {
              error: { message: 'Invalid subscription', code: 100 },
            })
          },
        }),
    })
    const response = await route.request('/7')
    const body = await response.text()
    assert.equal(response.status, 502)
    assert.match(body, /Invalid subscription/)
    assert.match(body, /"providerCode":100/)
    assert.equal(body.includes(configuration.accessToken), false)
  })
})

function client(
  overrides: Partial<WhatsAppSubscriptionsClientContract> = {},
): WhatsAppSubscriptionsClientContract {
  return {
    subscribe: async () => ({ success: true }),
    list: async () => ({ data: [] }),
    unsubscribe: async () => ({ success: true }),
    overrideCallback: async () => ({ data: [] }),
    ...overrides,
  }
}

function registrationClient(
  overrides: Partial<WhatsAppWebhookRegistrationClientContract> = {},
): WhatsAppWebhookRegistrationClientContract {
  return {
    register: async () => ({ success: true }),
    list: async () => ({ data: [] }),
    ...overrides,
  }
}
