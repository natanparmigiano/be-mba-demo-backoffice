import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppComponentsClient,
  WhatsAppComponentsApiError,
  WhatsAppComponentsResponseError,
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
    client: createWhatsAppComponentsClient({
      accessToken: 'access-secret',
      phoneNumberId: 'phone/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppComponentsClient', () => {
  it('sets commands and icebreaker prompts', async () => {
    const { client, requests } = clientWith([response({ success: true })])
    const controller = new AbortController()

    assert.deepEqual(
      await client.setConfiguration(
        {
          commands: [
            {
              command_name: ' shipping_options ',
              command_description: ' Show shipping options ',
            },
          ],
          prompts: [' Track my order '],
        },
        { signal: controller.signal },
      ),
      { success: true },
    )
    assert.equal(
      requestUrl(requests[0]).href,
      'http://graph.test/custom/v26.0/phone%2Fid/conversational_automation',
    )
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.equal(requests[0]?.init?.signal, controller.signal)
    assert.equal(
      new Headers(requests[0]?.init?.headers).get('authorization'),
      'Bearer access-secret',
    )
    assert.deepEqual(requestJson(requests[0]), {
      commands: [
        {
          command_name: 'shipping_options',
          command_description: 'Show shipping options',
        },
      ],
      prompts: ['Track my order'],
    })
  })

  it('reads the phone-number conversational_automation field', async () => {
    const configuration = {
      commands: [
        {
          command_name: 'catalog',
          command_description: 'Browse products',
          future_field: true,
        },
      ],
      prompts: ['Where is my order?'],
      future_setting: 'enabled',
    }
    const { client, requests } = clientWith([
      response({ conversational_automation: configuration, id: 'phone-id' }),
    ])

    assert.deepEqual(await client.getConfiguration(), configuration)
    assert.equal(requests[0]?.init?.method, 'GET')
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'conversational_automation',
    )
  })

  it('returns an empty configuration when no components are configured', async () => {
    const { client } = clientWith([response({ id: 'phone-id' })])

    assert.deepEqual(await client.getConfiguration(), {})
  })

  it('sets selected components and clears them with empty arrays', async () => {
    const { client, requests } = clientWith([response({ success: true })])

    assert.deepEqual(await client.setConfiguration({ prompts: [] }), {
      success: true,
    })
    assert.deepEqual(requestJson(requests[0]), { prompts: [] })
  })

  it('validates configuration and inputs without network I/O', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({ success: true }))
    }
    assert.throws(
      () =>
        createWhatsAppComponentsClient({
          accessToken: '',
          phoneNumberId: 'phone-id',
          fetch,
        }),
      /accessToken/,
    )
    const client = createWhatsAppComponentsClient({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      fetch,
    })
    await assert.rejects(client.setConfiguration({}), /at least one field/)
    await assert.rejects(
      client.setConfiguration({ prompts: [' '] }),
      /prompts\[0\]/,
    )
    await assert.rejects(
      client.setConfiguration({
        prompts: Array.from({ length: 5 }, () => 'Prompt'),
      }),
      /more than 4/,
    )
    await assert.rejects(
      client.setConfiguration({
        commands: [
          {
            command_name: 'x'.repeat(33),
            command_description: 'Description',
          },
        ],
      }),
      /32 characters/,
    )
    assert.equal(calls, 0)
  })

  it('surfaces structured Graph API errors without exposing tokens', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Unsupported component type',
            type: 'OAuthException',
            code: 100,
            error_subcode: 33,
            fbtrace_id: 'trace-id',
          },
        },
        400,
      ),
    ])
    await assert.rejects(client.getConfiguration(), (error: unknown) => {
      assert.ok(error instanceof WhatsAppComponentsApiError)
      assert.equal(error.status, 400)
      assert.equal(error.code, 100)
      assert.equal(error.subcode, 33)
      assert.equal(error.errorType, 'OAuthException')
      assert.equal(error.traceId, 'trace-id')
      assert.equal(JSON.stringify(error).includes('access-secret'), false)
      return true
    })
  })

  it('rejects malformed successful responses and invalid JSON', async () => {
    const { client } = clientWith([
      response({
        conversational_automation: {
          commands: [{ command_name: 'missing-description' }],
        },
      }),
      response({ success: false }),
      response({ conversational_automation: null }),
      new Response('not-json', { status: 200 }),
    ])
    await assert.rejects(
      client.getConfiguration(),
      WhatsAppComponentsResponseError,
    )
    await assert.rejects(
      client.setConfiguration({ prompts: ['Hello'] }),
      WhatsAppComponentsResponseError,
    )
    await assert.rejects(
      client.getConfiguration(),
      WhatsAppComponentsResponseError,
    )
    await assert.rejects(
      client.getConfiguration(),
      WhatsAppComponentsResponseError,
    )
  })
})
