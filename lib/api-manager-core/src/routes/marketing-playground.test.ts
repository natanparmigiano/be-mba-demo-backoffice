import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WhatsAppMarketingApiError,
  type SendMarketingMessageInput,
  type WhatsAppMarketingClientContract,
} from '@mba-desk/wa-marketing'
import { createMarketingPlaygroundRoute } from './marketing-playground.js'

const configuration = { phoneNumberId: 'phone-id', accessToken: 'token' }
const responseBody = {
  messaging_product: 'whatsapp' as const,
  contacts: [{ input: '15551234567', wa_id: '15551234567' }],
  messages: [{ id: 'wamid.1', message_status: 'accepted' as const }],
}

describe('marketing playground route', () => {
  it('sends a validated template for an organization manager', async () => {
    let sent: SendMarketingMessageInput | undefined
    const route = createMarketingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      repository: { getConfiguration: async () => configuration },
      createMarketingClient: () =>
        createClient(async (input) => {
          sent = input
          return responseBody
        }),
    })
    const response = await request(route)
    assert.equal(response.status, 200)
    assert.deepEqual(sent, {
      to: '15551234567',
      template: { name: 'seasonal_sale', language: { code: 'en_US' } },
      product_policy: 'STRICT',
      message_activity_sharing: true,
      bid_spec: { per_message_bid_multiplier: 1.5 },
    })
    assert.deepEqual(await response.json(), { result: responseBody })
  })

  it('enforces authentication, manager role, and channel ownership', async () => {
    const unauthorized = createMarketingPlaygroundRoute({
      getAccess: async () => undefined,
    })
    assert.equal((await request(unauthorized)).status, 401)

    const member = createMarketingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
    })
    assert.equal((await request(member)).status, 403)

    const missing = createMarketingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: { getConfiguration: async () => undefined },
    })
    assert.equal((await request(missing)).status, 404)
  })

  it('maps provider errors without returning credentials', async () => {
    const route = createMarketingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      repository: { getConfiguration: async () => configuration },
      createMarketingClient: () =>
        createClient(async () => {
          throw new WhatsAppMarketingApiError(400, {
            error: { message: 'WABA is not onboarded', code: 100 },
          })
        }),
    })
    const response = await request(route)
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), {
      message: 'Meta rejected the marketing message: WABA is not onboarded',
      providerStatus: 400,
    })
  })

  it('rejects malformed input at the route boundary', async () => {
    const route = createMarketingPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
    })
    const response = await route.request('/7/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp' }),
    })
    assert.equal(response.status, 400)
  })
})

function request(route: ReturnType<typeof createMarketingPlaygroundRoute>) {
  return route.request('/7/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '15551234567',
      type: 'template',
      template: { name: 'seasonal_sale', language: { code: 'en_US' } },
      product_policy: 'STRICT',
      message_activity_sharing: true,
      bid_spec: { per_message_bid_multiplier: 1.5 },
    }),
  })
}

function createClient(
  send: WhatsAppMarketingClientContract['send'],
): WhatsAppMarketingClientContract {
  return { send }
}
