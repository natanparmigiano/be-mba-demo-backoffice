import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppQrClient,
  WhatsAppQrApiError,
  WhatsAppQrResponseError,
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
    client: createWhatsAppQrClient({
      accessToken: 'access-secret',
      phoneNumberId: 'phone/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppQrClient', () => {
  it('creates a QR code and optionally requests an image', async () => {
    const created = {
      code: 'ANED2T5QRU7HG1',
      prefilled_message: 'Show me Cyber Monday deals!',
      deep_link_url: 'https://wa.me/message/ANED2T5QRU7HG1',
      qr_image_url: 'https://cdn.test/code.svg',
      future_field: true,
    }
    const { client, requests } = clientWith([response(created)])
    const controller = new AbortController()

    assert.deepEqual(
      await client.create(
        {
          prefilled_message: ' Show me Cyber Monday deals! ',
          generate_qr_image: 'SVG',
        },
        { signal: controller.signal },
      ),
      created,
    )
    assert.equal(
      requestUrl(requests[0]).href,
      'http://graph.test/custom/v26.0/phone%2Fid/message_qrdls',
    )
    assert.equal(requests[0]?.init?.method, 'POST')
    assert.equal(requests[0]?.init?.signal, controller.signal)
    assert.equal(
      new Headers(requests[0]?.init?.headers).get('authorization'),
      'Bearer access-secret',
    )
    assert.equal(
      new Headers(requests[0]?.init?.headers).get('content-type'),
      'application/json',
    )
    assert.deepEqual(requestJson(requests[0]), {
      prefilled_message: 'Show me Cyber Monday deals!',
      generate_qr_image: 'svg',
    })
  })

  it('gets one QR code from the collection response envelope', async () => {
    const qrCode = {
      code: 'ANED2T5QRU7HG1',
      prefilled_message: 'Show me Cyber Monday deals!',
      deep_link_url: 'https://wa.me/message/ANED2T5QRU7HG1',
    }
    const { client, requests } = clientWith([response({ data: [qrCode] })])

    assert.deepEqual(await client.get('code/id'), qrCode)
    assert.equal(
      requestUrl(requests[0]).href,
      'http://graph.test/custom/v26.0/phone%2Fid/message_qrdls/code%2Fid',
    )
    assert.equal(requests[0]?.init?.method, 'GET')
  })

  it('gets SVG and PNG image URLs through the code-filter endpoint', async () => {
    const qrCode = {
      code: 'FO7JXE4BG3RFG1',
      prefilled_message: 'Tell me more',
      deep_link_url: 'https://wa.me/message/FO7JXE4BG3RFG1',
      qr_image_url: 'https://cdn.test/code.png',
    }
    const { client, requests } = clientWith([response({ data: [qrCode] })])

    assert.deepEqual(await client.getImageUrl(qrCode.code, 'PNG'), qrCode)
    const url = requestUrl(requests[0])
    assert.equal(url.searchParams.get('code'), qrCode.code)
    assert.equal(
      url.searchParams.get('fields'),
      'code,prefilled_message,deep_link_url,qr_image_url.format(PNG)',
    )
  })

  it('lists QR codes with selected fields, image format, and pagination', async () => {
    const page = {
      data: [
        {
          code: '5QBPAD2DC6L5A1',
          prefilled_message: 'Show me Cyber Tuesday deals!',
          qr_image_url: 'https://cdn.test/code.svg',
        },
      ],
      paging: { cursors: { before: 'before', after: 'after' } },
    }
    const { client, requests } = clientWith([response(page)])

    assert.deepEqual(
      await client.list({
        fields: ['prefilled_message'],
        imageFormat: 'SVG',
        limit: 25,
        before: 'before',
        after: 'after',
      }),
      page,
    )
    const url = requestUrl(requests[0])
    assert.equal(
      url.searchParams.get('fields'),
      'code,prefilled_message,qr_image_url.format(SVG)',
    )
    assert.equal(url.searchParams.get('limit'), '25')
    assert.equal(url.searchParams.get('before'), 'before')
    assert.equal(url.searchParams.get('after'), 'after')
  })

  it('updates the prefilled message and deletes a QR code', async () => {
    const updated = {
      code: 'WOMVT6TJ2BP7A1',
      prefilled_message: 'Tell me about your new workshops',
      deep_link_url: 'https://wa.me/message/WOMVT6TJ2BP7A1',
    }
    const { client, requests } = clientWith([
      response(updated),
      response({ success: true }),
    ])

    assert.deepEqual(
      await client.update(updated.code, {
        prefilled_message: ' Tell me about your new workshops ',
      }),
      updated,
    )
    assert.deepEqual(requestJson(requests[0]), {
      code: updated.code,
      prefilled_message: updated.prefilled_message,
    })
    assert.deepEqual(await client.delete(updated.code), { success: true })
    assert.equal(requests[1]?.init?.method, 'DELETE')
    assert.equal(
      requestUrl(requests[1]).pathname,
      '/custom/v26.0/phone%2Fid/message_qrdls/WOMVT6TJ2BP7A1',
    )
  })

  it('validates configuration and inputs without network I/O', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({ data: [] }))
    }

    assert.throws(
      () =>
        createWhatsAppQrClient({
          accessToken: '',
          phoneNumberId: 'phone-id',
          fetch,
        }),
      /accessToken/,
    )
    assert.throws(
      () =>
        createWhatsAppQrClient({
          accessToken: 'token',
          phoneNumberId: '',
          fetch,
        }),
      /phoneNumberId/,
    )
    assert.throws(
      () =>
        createWhatsAppQrClient({
          accessToken: 'token',
          phoneNumberId: 'phone-id',
          graphApiVersion: '26',
          fetch,
        }),
      /v26\.0/,
    )

    const client = createWhatsAppQrClient({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      fetch,
    })
    await assert.rejects(client.create({ prefilled_message: ' ' }), /prefilled/)
    await assert.rejects(client.get(''), /code/)
    await assert.rejects(client.getImageUrl('code', 'GIF' as 'PNG'), /PNG/)
    await assert.rejects(client.list({ limit: 0 }), /positive integer/)
    await assert.rejects(
      client.update('code', { prefilled_message: '' }),
      /prefilled/,
    )
    await assert.rejects(client.delete(''), /code/)
    assert.equal(calls, 0)
  })

  it('surfaces structured Graph API errors without exposing tokens', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'QR code was not found',
            type: 'OAuthException',
            code: 100,
            error_subcode: 33,
            fbtrace_id: 'trace-id',
          },
        },
        404,
      ),
    ])

    await assert.rejects(client.get('missing'), (error: unknown) => {
      assert.ok(error instanceof WhatsAppQrApiError)
      assert.equal(error.message, 'QR code was not found')
      assert.equal(error.status, 404)
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
      response({ data: [] }),
      response({ data: [{ code: 'code' }] }),
      response({ data: [{ prefilled_message: 'Missing code' }] }),
      response({ code: 'code', qr_image_url: 1 }),
      response({ success: false }),
      new Response('not-json', { status: 200 }),
    ])

    await assert.rejects(client.get('code'), WhatsAppQrResponseError)
    await assert.rejects(
      client.getImageUrl('code', 'SVG'),
      WhatsAppQrResponseError,
    )
    await assert.rejects(client.list(), WhatsAppQrResponseError)
    await assert.rejects(
      client.create({ prefilled_message: 'Hello' }),
      WhatsAppQrResponseError,
    )
    await assert.rejects(client.delete('code'), WhatsAppQrResponseError)
    await assert.rejects(
      client.update('code', { prefilled_message: 'Hello' }),
      WhatsAppQrResponseError,
    )
  })
})
