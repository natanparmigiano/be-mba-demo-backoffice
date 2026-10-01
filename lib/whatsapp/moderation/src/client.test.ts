import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppModerationClient,
  WhatsAppModerationApiError,
  WhatsAppModerationResponseError,
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
    client: createWhatsAppModerationClient({
      accessToken: 'access-secret',
      phoneNumberId: 'phone/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppModerationClient', () => {
  it('lists blocked users with cursor pagination', async () => {
    const page = {
      data: [{ messaging_product: 'whatsapp', wa_id: '16505551234' }],
      paging: {
        cursors: { before: 'before-cursor', after: 'after-cursor' },
      },
    }
    const { client, requests } = clientWith([response(page)])
    const controller = new AbortController()

    assert.deepEqual(
      await client.list({
        limit: 10,
        before: 'before-cursor',
        after: 'after-cursor',
        signal: controller.signal,
      }),
      page,
    )

    const url = requestUrl(requests[0])
    assert.equal(
      url.origin + url.pathname,
      'http://graph.test/custom/v26.0/phone%2Fid/block_users',
    )
    assert.equal(url.searchParams.get('limit'), '10')
    assert.equal(url.searchParams.get('before'), 'before-cursor')
    assert.equal(url.searchParams.get('after'), 'after-cursor')
    assert.equal(requests[0]?.init?.method, 'GET')
    assert.equal(requests[0]?.init?.signal, controller.signal)
  })

  it('blocks users and preserves partial failures', async () => {
    const body = {
      messaging_product: 'whatsapp',
      block_users: {
        added_users: [{ input: '+16505551234', wa_id: '16505551234' }],
        failed_users: [
          {
            input: '+14155559876',
            errors: [
              {
                message: 'Re-engagement required',
                code: 131047,
                error_data: {
                  details: 'User has not messaged in the last 24 hours',
                },
              },
            ],
          },
        ],
      },
      error: {
        message: '(#139100) Failed to block/unblock users',
        type: 'OAuthException',
        code: 139100,
      },
    }
    const { client, requests } = clientWith([response(body)])

    assert.deepEqual(
      await client.block([' +16505551234 ', '+14155559876']),
      body,
    )
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.deepEqual(requestJson(requests[0]), {
      messaging_product: 'whatsapp',
      block_users: [{ user: '+16505551234' }, { user: '+14155559876' }],
    })
  })

  it('unblocks users', async () => {
    const body = {
      messaging_product: 'whatsapp',
      block_users: {
        removed_users: [{ input: '+16505551234', wa_id: '16505551234' }],
      },
    }
    const { client, requests } = clientWith([response(body)])

    assert.deepEqual(await client.unblock(['+16505551234']), body)
    assert.equal(requests[0]?.init?.method, 'DELETE')
  })

  it('enforces documented request limits without network I/O', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({}))
    }
    const client = createWhatsAppModerationClient({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      fetch,
    })

    await assert.rejects(client.block([]), /between 1 and 1000/)
    await assert.rejects(
      client.unblock(Array.from({ length: 1_001 }, () => '+16505551234')),
      /between 1 and 1000/,
    )
    await assert.rejects(client.block(['  ']), /user must not be empty/)
    await assert.rejects(client.list({ limit: 0 }), /positive integer/)
    assert.equal(calls, 0)
  })

  it('validates client configuration without network I/O', () => {
    assert.throws(
      () =>
        createWhatsAppModerationClient({
          accessToken: '',
          phoneNumberId: 'phone-id',
        }),
      /accessToken/,
    )
    assert.throws(
      () =>
        createWhatsAppModerationClient({
          accessToken: 'token',
          phoneNumberId: '',
        }),
      /phoneNumberId/,
    )
    assert.throws(
      () =>
        createWhatsAppModerationClient({
          accessToken: 'token',
          phoneNumberId: 'phone-id',
          graphApiVersion: '26',
        }),
      /v26\.0/,
    )
  })

  it('surfaces structured Graph API errors without exposing tokens', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Blocklist limit reached',
            type: 'OAuthException',
            code: 139101,
            error_subcode: 1,
            fbtrace_id: 'trace-id',
          },
        },
        400,
      ),
    ])

    await assert.rejects(client.block(['+16505551234']), (error: unknown) => {
      assert.ok(error instanceof WhatsAppModerationApiError)
      assert.equal(error.message, 'Blocklist limit reached')
      assert.equal(error.status, 400)
      assert.equal(error.code, 139101)
      assert.equal(error.subcode, 1)
      assert.equal(error.errorType, 'OAuthException')
      assert.equal(error.traceId, 'trace-id')
      assert.equal(JSON.stringify(error).includes('access-secret'), false)
      return true
    })
  })

  it('rejects malformed successful responses and invalid JSON', async () => {
    const { client } = clientWith([
      response({ data: [{ messaging_product: 'whatsapp' }] }),
      response({ messaging_product: 'whatsapp', block_users: {} }),
      new Response('not-json', { status: 200 }),
    ])

    await assert.rejects(client.list(), WhatsAppModerationResponseError)
    await assert.rejects(
      client.block(['+16505551234']),
      WhatsAppModerationResponseError,
    )
    await assert.rejects(
      client.unblock(['+16505551234']),
      WhatsAppModerationResponseError,
    )
  })
})
