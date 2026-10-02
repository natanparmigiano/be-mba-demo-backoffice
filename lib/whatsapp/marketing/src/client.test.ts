import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppMarketingClient,
  WhatsAppMarketingApiError,
  WhatsAppMarketingResponseError,
} from './index.js'

describe('WhatsAppMarketingClient', () => {
  it('sends a marketing template through the marketing_messages edge', async () => {
    let request: Request | undefined
    const client = createWhatsAppMarketingClient({
      accessToken: 'secret-token',
      phoneNumberId: '123 456',
      graphApiBaseUrl: 'https://example.test/graph',
      fetch: async (input, init) => {
        request = new Request(input, init)
        return Response.json({
          messaging_product: 'whatsapp',
          contacts: [{ input: '15551234567', wa_id: '15551234567' }],
          messages: [{ id: 'wamid.1', message_status: 'accepted' }],
        })
      },
    })

    const result = await client.send({
      to: ' 15551234567 ',
      template: {
        name: 'seasonal_sale',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: '20%' }],
          },
        ],
      },
      product_policy: 'STRICT',
      message_activity_sharing: true,
      bid_spec: { per_message_bid_multiplier: 1.5 },
    })

    assert.equal(
      request?.url,
      'https://example.test/graph/v26.0/123%20456/marketing_messages',
    )
    assert.equal(request?.method, 'POST')
    assert.equal(request?.headers.get('authorization'), 'Bearer secret-token')
    assert.deepEqual(await request?.json(), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '15551234567',
      type: 'template',
      template: {
        name: 'seasonal_sale',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: '20%' }],
          },
        ],
      },
      product_policy: 'STRICT',
      message_activity_sharing: true,
      bid_spec: { per_message_bid_multiplier: 1.5 },
    })
    assert.equal(result.messages[0]?.id, 'wamid.1')
  })

  it('validates required fields and the optional bid multiplier', async () => {
    const client = createWhatsAppMarketingClient({
      accessToken: 'token',
      phoneNumberId: '123',
      fetch: async () => assert.fail('fetch must not be called'),
    })
    await assert.rejects(
      client.send({
        to: '',
        template: { name: 'sale', language: { code: 'en' } },
      }),
      /to must not be empty/,
    )
    await assert.rejects(
      client.send({
        to: '15551234567',
        template: { name: 'sale', language: { code: 'en' } },
        bid_spec: { per_message_bid_multiplier: 0 },
      }),
      /must be a positive number/,
    )
  })

  it('surfaces Graph API errors without exposing the access token', async () => {
    const client = createWhatsAppMarketingClient({
      accessToken: 'never-print-this',
      phoneNumberId: '123',
      fetch: async () =>
        Response.json(
          {
            error: {
              message: 'Not eligible',
              type: 'OAuthException',
              code: 100,
              error_subcode: 42,
              fbtrace_id: 'trace-1',
            },
          },
          { status: 400 },
        ),
    })

    await assert.rejects(
      client.send({
        to: '15551234567',
        template: { name: 'sale', language: { code: 'en' } },
      }),
      (error) => {
        assert.ok(error instanceof WhatsAppMarketingApiError)
        assert.equal(error.status, 400)
        assert.equal(error.code, 100)
        assert.equal(error.subcode, 42)
        assert.equal(error.traceId, 'trace-1')
        assert.doesNotMatch(error.message, /never-print-this/)
        return true
      },
    )
  })

  it('rejects malformed successful responses', async () => {
    const client = createWhatsAppMarketingClient({
      accessToken: 'token',
      phoneNumberId: '123',
      fetch: async () => Response.json({ success: true }),
    })
    await assert.rejects(
      client.send({
        to: '15551234567',
        template: { name: 'sale', language: { code: 'en' } },
      }),
      WhatsAppMarketingResponseError,
    )
  })
})
