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
    assert.equal(request?.init?.body instanceof URLSearchParams, true)
    const body = request?.init?.body?.toString()
    assert.equal(
      body,
      `object=whatsapp_business_account&callback_url=https%3A%2F%2Fapp.example.com%2Fapi%2Fwa-cloud%2Fwebhook%2F7&verify_token=verify-secret&fields=${WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS.join('%2C')}&access_token=app%2Fid%7Capp-secret`,
    )
  })

  it('lists the fields currently registered for the app', async () => {
    const requests: RecordedRequest[] = []
    const fetch: WebhookRegistrationFetch = async (input, init) => {
      requests.push({ input, init })
      return response({
        data: [
          {
            object: 'whatsapp_business_account',
            callback_url: 'https://app.example.com/webhook',
            active: true,
            fields: [
              { name: 'messages', version: 'v26.0' },
              { name: 'phone_number_quality_update', version: 'v26.0' },
            ],
          },
        ],
      })
    }
    const client = createWhatsAppWebhookRegistrationClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      graphApiBaseUrl: 'http://graph.test',
      fetch,
    })

    assert.deepEqual((await client.list()).data[0]?.fields, [
      { name: 'messages', version: 'v26.0' },
      { name: 'phone_number_quality_update', version: 'v26.0' },
    ])
    assert.equal(requests[0]?.init?.method, 'GET')
    assert.equal(
      requestUrl(requests[0]).searchParams.get('access_token'),
      'app-id|app-secret',
    )
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

  it('preserves the status of a non-JSON Graph error', async () => {
    const client = createWhatsAppWebhookRegistrationClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      fetch: async () =>
        new Response('Callback validation failed', { status: 433 }),
    })

    await assert.rejects(
      client.register({
        callbackUrl: 'https://app.example.com/webhook',
        verifyToken: 'verify-secret',
        fields: ['messages'],
      }),
      (error: unknown) => {
        assert.ok(error instanceof WhatsAppWebhookRegistrationApiError)
        assert.equal(error.status, 433)
        assert.equal(error.body, 'Callback validation failed')
        assert.equal(error.message, 'Callback validation failed')
        return true
      },
    )
  })
})
