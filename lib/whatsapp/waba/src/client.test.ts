import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppWabaClient,
  WhatsAppWabaApiError,
  WhatsAppWabaResponseError,
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

function clientWith(responses: Response[]) {
  const recorded = recordingFetch(responses)
  return {
    ...recorded,
    client: createWhatsAppWabaClient({
      accessToken: 'access-secret',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppWabaClient', () => {
  it('gets one WABA by ID', async () => {
    const account = {
      id: '104996122399160',
      name: 'Lucky Shrub',
      timezone_id: '1',
      message_template_namespace: 'namespace',
      future_field: true,
    }
    const { client, requests } = clientWith([response(account)])
    const controller = new AbortController()

    assert.deepEqual(
      await client.get('waba/id', { signal: controller.signal }),
      account,
    )
    assert.equal(
      requestUrl(requests[0]).href,
      'http://graph.test/custom/v26.0/waba%2Fid',
    )
    assert.equal(requests[0]?.init?.method, 'GET')
    assert.equal(requests[0]?.init?.signal, controller.signal)
    assert.equal(
      new Headers(requests[0]?.init?.headers).get('authorization'),
      'Bearer access-secret',
    )
  })

  it('lists owned WABAs with pagination', async () => {
    const page = {
      data: [
        {
          id: '104996122399160',
          name: 'Lucky Shrub',
          timezone_id: '1',
        },
      ],
      paging: { cursors: { before: 'before', after: 'after' } },
    }
    const { client, requests } = clientWith([response(page)])

    assert.deepEqual(
      await client.listOwned('business/id', {
        limit: 25,
        before: 'before',
        after: 'after',
      }),
      page,
    )
    const url = requestUrl(requests[0])
    assert.equal(
      url.origin + url.pathname,
      'http://graph.test/custom/v26.0/business%2Fid/owned_whatsapp_business_accounts',
    )
    assert.equal(url.searchParams.get('limit'), '25')
    assert.equal(url.searchParams.get('before'), 'before')
    assert.equal(url.searchParams.get('after'), 'after')
  })

  it('lists shared WABAs and normalizes safe numeric IDs', async () => {
    const { client, requests } = clientWith([
      response({
        data: [
          {
            id: 1906385232743451,
            name: 'Shared account',
            currency: 'USD',
          },
        ],
      }),
    ])

    const page = await client.listShared('business-id')

    assert.equal(page.data[0]?.id, '1906385232743451')
    assert.equal(
      requestUrl(requests[0]).pathname,
      '/custom/v26.0/business-id/client_whatsapp_business_accounts',
    )
  })

  it('validates configuration and list options without network I/O', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({ data: [] }))
    }

    assert.throws(
      () => createWhatsAppWabaClient({ accessToken: '', fetch }),
      /accessToken/,
    )
    assert.throws(
      () =>
        createWhatsAppWabaClient({
          accessToken: 'token',
          graphApiVersion: '26',
          fetch,
        }),
      /v26\.0/,
    )

    const client = createWhatsAppWabaClient({
      accessToken: 'token',
      fetch,
    })
    await assert.rejects(client.get(''), /wabaId/)
    await assert.rejects(client.listOwned('', {}), /businessId/)
    await assert.rejects(client.listShared('business', { limit: 0 }), /limit/)
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

    await assert.rejects(client.get('waba-id'), (error: unknown) => {
      assert.ok(error instanceof WhatsAppWabaApiError)
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
      response({ name: 'Missing ID' }),
      response({ data: [{ id: Number.MAX_SAFE_INTEGER + 1 }] }),
      new Response('not-json', { status: 200 }),
    ])

    await assert.rejects(client.get('waba-id'), WhatsAppWabaResponseError)
    await assert.rejects(
      client.listOwned('business-id'),
      WhatsAppWabaResponseError,
    )
    await assert.rejects(
      client.listShared('business-id'),
      WhatsAppWabaResponseError,
    )
  })
})
