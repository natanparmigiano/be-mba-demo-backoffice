import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppSubscriptionsClient,
  WhatsAppSubscriptionsApiError,
  WhatsAppSubscriptionsResponseError,
} from './index.js'
import type { Fetch } from './index.js'

interface RecordedRequest {
  input: string | URL | Request
  init?: RequestInit
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function recordingFetch(responses: Response[]) {
  const requests: RecordedRequest[] = []
  const fetch: Fetch = (input, init) => {
    requests.push({ input, init })
    const next = responses.shift()
    if (!next) throw new Error('No response configured')
    return Promise.resolve(next)
  }
  return { fetch, requests }
}

function requestUrl(request: RecordedRequest | undefined): URL {
  const input = request?.input
  if (input instanceof URL) return input
  if (typeof input === 'string') return new URL(input)
  if (input instanceof Request) return new URL(input.url)
  throw new TypeError('Expected a request URL')
}

function requestJson(request: RecordedRequest | undefined): unknown {
  const body = request?.init?.body
  if (typeof body !== 'string') throw new TypeError('Expected a JSON body')
  return JSON.parse(body) as unknown
}

function clientWith(responses: Response[]) {
  const recorded = recordingFetch(responses)
  return {
    ...recorded,
    client: createWhatsAppSubscriptionsClient({
      accessToken: 'access-secret',
      wabaId: 'waba/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppSubscriptionsClient', () => {
  it('subscribes, lists, overrides, and unsubscribes on the WABA edge', async () => {
    const listedSubscription = {
      whatsapp_business_api_data: {
        id: 'app-id',
        link: 'https://example.test/app',
        name: 'Example App',
      },
    }
    const overriddenSubscription = {
      ...listedSubscription,
      override_callback_uri: 'https://app.example.test/webhook',
    }
    const { client, requests } = clientWith([
      response({ success: true }),
      response({ data: [listedSubscription] }),
      response({ data: [overriddenSubscription] }),
      response({ success: true }),
    ])

    assert.deepEqual(await client.subscribe(), { success: true })
    assert.deepEqual((await client.list()).data, [listedSubscription])
    assert.deepEqual(
      (
        await client.overrideCallback({
          override_callback_uri: 'https://app.example.test/webhook',
          verify_token: 'verify-secret',
        })
      ).data,
      [overriddenSubscription],
    )
    assert.deepEqual(await client.unsubscribe(), { success: true })

    for (const request of requests) {
      assert.equal(
        requestUrl(request).href,
        'http://graph.test/custom/v26.0/waba%2Fid/subscribed_apps',
      )
      assert.equal(
        new Headers(request.init?.headers).get('authorization'),
        'Bearer access-secret',
      )
    }
    assert.deepEqual(
      requests.map((request) => request.init?.method),
      ['POST', 'GET', 'POST', 'DELETE'],
    )
    assert.deepEqual(requestJson(requests[2]), {
      override_callback_uri: 'https://app.example.test/webhook',
      verify_token: 'verify-secret',
    })
  })

  it('forwards abort signals', async () => {
    const controller = new AbortController()
    const { client, requests } = clientWith([response({ data: [] })])

    await client.list({ signal: controller.signal })

    assert.equal(requests[0]?.init?.signal, controller.signal)
  })

  it('validates configuration and override input without making requests', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({ success: true }))
    }

    assert.throws(
      () =>
        createWhatsAppSubscriptionsClient({
          accessToken: '',
          wabaId: 'waba-id',
          fetch,
        }),
      /accessToken/,
    )
    assert.throws(
      () =>
        createWhatsAppSubscriptionsClient({
          accessToken: 'token',
          wabaId: '',
          fetch,
        }),
      /wabaId/,
    )
    assert.throws(
      () =>
        createWhatsAppSubscriptionsClient({
          accessToken: 'token',
          wabaId: 'waba-id',
          graphApiVersion: '26',
          fetch,
        }),
      /v26\.0/,
    )

    const client = createWhatsAppSubscriptionsClient({
      accessToken: 'token',
      wabaId: 'waba-id',
      fetch,
    })
    await assert.rejects(
      client.overrideCallback({
        override_callback_uri: 'file:///tmp/webhook',
        verify_token: 'secret',
      }),
      /http or https/,
    )
    assert.equal(calls, 0)
  })

  it('surfaces structured Graph API errors without exposing tokens', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Missing permission',
            type: 'OAuthException',
            code: 200,
            error_subcode: 33,
            fbtrace_id: 'trace-id',
          },
        },
        403,
      ),
    ])

    await assert.rejects(client.subscribe(), (error: unknown) => {
      assert.ok(error instanceof WhatsAppSubscriptionsApiError)
      assert.equal(error.message, 'Missing permission')
      assert.equal(error.status, 403)
      assert.equal(error.code, 200)
      assert.equal(error.subcode, 33)
      assert.equal(error.errorType, 'OAuthException')
      assert.equal(error.traceId, 'trace-id')
      assert.equal(JSON.stringify(error).includes('access-secret'), false)
      return true
    })
  })

  it('rejects malformed successful responses and invalid JSON', async () => {
    const { client } = clientWith([
      response({ data: [{ whatsapp_business_api_data: {} }] }),
      response({ success: false }),
      new Response('not-json', { status: 200 }),
    ])

    await assert.rejects(client.list(), WhatsAppSubscriptionsResponseError)
    await assert.rejects(
      client.unsubscribe(),
      WhatsAppSubscriptionsResponseError,
    )
    await assert.rejects(client.subscribe(), WhatsAppSubscriptionsResponseError)
  })
})
