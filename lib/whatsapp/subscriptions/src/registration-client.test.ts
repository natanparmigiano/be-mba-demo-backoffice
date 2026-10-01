import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppWebhookRegistrationClient,
  WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
  WhatsAppWebhookRegistrationApiError,
  WhatsAppWebhookRegistrationResponseError,
} from './index.js'
import type { WebhookRegistrationFetch } from './index.js'

interface RecordedRequest {
  input: string | URL | Request
  init?: RequestInit
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function requestUrl(request: RecordedRequest | undefined): URL {
  const input = request?.input
  if (input instanceof URL) return input
  if (typeof input === 'string') return new URL(input)
  if (input instanceof Request) return new URL(input.url)
  throw new TypeError('Expected a request URL')
}

describe('WhatsAppWebhookRegistrationClient', () => {
  it('registers every supported field with an app access token', async () => {
    const requests: RecordedRequest[] = []
    const fetch: WebhookRegistrationFetch = async (input, init) => {
      requests.push({ input, init })
      return response({ success: true })
    }
    const client = createWhatsAppWebhookRegistrationClient({
      appId: 'app/id',
      appSecret: 'app-secret',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch,
    })

    assert.deepEqual(
      await client.register({
        callbackUrl: 'https://app.example.com/api/wa-cloud/webhook/7',
        verifyToken: 'verify-secret',
        fields: WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
      }),
      { success: true },
    )

    const request = requests[0]
    assert.equal(
      requestUrl(request).href,
      'http://graph.test/custom/v26.0/app%2Fid/subscriptions',
    )
    assert.equal(request?.init?.method, 'POST')
    assert.equal(
      new Headers(request?.init?.headers).get('content-type'),
      'application/x-www-form-urlencoded',
    )
    assert.ok(request?.init?.body instanceof URLSearchParams)
    const body = request.init.body
    assert.equal(body.get('object'), 'whatsapp_business_account')
    assert.equal(
      body.get('callback_url'),
      'https://app.example.com/api/wa-cloud/webhook/7',
    )
    assert.equal(body.get('verify_token'), 'verify-secret')
    assert.equal(
      body.get('fields'),
      WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS.join(','),
    )
    assert.equal(body.get('access_token'), 'app/id|app-secret')
  })

  it('validates inputs before making a request', async () => {
    let calls = 0
    const fetch: WebhookRegistrationFetch = async () => {
      calls += 1
      return response({ success: true })
    }
    const client = createWhatsAppWebhookRegistrationClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      fetch,
    })

    await assert.rejects(
      client.register({
        callbackUrl: 'file:///tmp/webhook',
        verifyToken: 'verify-secret',
        fields: WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
      }),
      /HTTP or HTTPS/,
    )
    await assert.rejects(
      client.register({
        callbackUrl: 'https://app.example.com/webhook',
        verifyToken: 'verify-secret',
        fields: [],
      }),
      /at least one/,
    )
    assert.equal(calls, 0)
  })

  it('maps Graph errors and malformed successful responses', async () => {
    const responses = [
      response(
        {
          error: {
            message: 'Invalid callback URL',
            type: 'OAuthException',
            code: 100,
            error_subcode: 33,
            fbtrace_id: 'trace-id',
          },
        },
        400,
      ),
      response({ success: false }),
    ]
    const client = createWhatsAppWebhookRegistrationClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      fetch: async () => responses.shift()!,
    })
    const input = {
      callbackUrl: 'https://app.example.com/webhook',
      verifyToken: 'verify-secret',
      fields: WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
    } as const

    await assert.rejects(client.register(input), (error: unknown) => {
      assert.ok(error instanceof WhatsAppWebhookRegistrationApiError)
      assert.equal(error.status, 400)
      assert.equal(error.code, 100)
      assert.equal(error.subcode, 33)
      assert.equal(error.traceId, 'trace-id')
      assert.equal(JSON.stringify(error).includes('app-secret'), false)
      return true
    })
    await assert.rejects(
      client.register(input),
      WhatsAppWebhookRegistrationResponseError,
    )
  })
})
