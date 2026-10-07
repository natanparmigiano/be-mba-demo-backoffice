import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWebhooksPlaygroundRoute,
  type WebhooksPlaygroundRepository,
} from './webhooks-playground.js'

const validWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-id',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: 'phone-id',
            },
            messages: [
              {
                from: '15557654321',
                id: 'wamid.message',
                timestamp: '1790899200',
                type: 'text',
                text: { body: 'Hello' },
              },
            ],
          },
        },
      ],
    },
  ],
}

describe('webhooks playground route', () => {
  it('validates a webhook for a member using a channel in their organization', async () => {
    let lookup: { organizationId: string; channelId: number } | undefined
    const repository: WebhooksPlaygroundRepository = {
      channelExists: async (organizationId, channelId) => {
        lookup = { organizationId, channelId }
        return true
      },
    }
    const route = createWebhooksPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository,
    })

    const response = await request(route, validWebhook)

    assert.equal(response.status, 200)
    assert.deepEqual(lookup, { organizationId: 'org-one', channelId: 7 })
    assert.deepEqual(await response.json(), { result: validWebhook })
  })

  it('returns validation issues for a malformed webhook', async () => {
    const route = createWebhooksPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: { channelExists: async () => true },
    })

    const response = await request(route, { object: 'not-whatsapp', entry: [] })
    const body = (await response.json()) as {
      message: string
      issues: unknown[]
    }

    assert.equal(response.status, 400)
    assert.equal(body.message, 'Invalid WhatsApp webhook payload')
    assert.ok(body.issues.length > 0)
  })

  it('does not validate against a channel outside the active organization', async () => {
    let parseCalled = false
    const route = createWebhooksPlaygroundRoute({
      getAccess: async () => ({ organizationId: 'org-one' }),
      repository: { channelExists: async () => false },
      parseWebhook: ((input: unknown) => {
        parseCalled = true
        return { success: true, data: input }
      }) as never,
    })

    const response = await request(route, validWebhook)

    assert.equal(response.status, 404)
    assert.equal(parseCalled, false)
  })

  it('requires an authenticated organization membership', async () => {
    let repositoryCalled = false
    const route = createWebhooksPlaygroundRoute({
      getAccess: async () => undefined,
      repository: {
        channelExists: async () => {
          repositoryCalled = true
          return true
        },
      },
    })

    const response = await request(route, validWebhook)

    assert.equal(response.status, 401)
    assert.equal(repositoryCalled, false)
  })
})

function request(
  route: ReturnType<typeof createWebhooksPlaygroundRoute>,
  payload: unknown,
) {
  return route.request('/7/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload }),
  })
}
