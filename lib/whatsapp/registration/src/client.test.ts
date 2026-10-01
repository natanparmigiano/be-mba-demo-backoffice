import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppRegistrationClient,
  WhatsAppRegistrationApiError,
  WhatsAppRegistrationResponseError,
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
    client: createWhatsAppRegistrationClient({
      accessToken: 'access-secret',
      phoneNumberId: 'phone/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppRegistrationClient', () => {
  it('registers with optional data localization and deregisters', async () => {
    const controller = new AbortController()
    const { client, requests } = clientWith([
      response({ success: true }),
      response({ success: true }),
    ])

    assert.deepEqual(
      await client.register(
        { pin: '123456', data_localization_region: 'BR' },
        { signal: controller.signal },
      ),
      { success: true },
    )
    assert.deepEqual(await client.deregister(), { success: true })

    assert.equal(
      requestUrl(requests[0]).href,
      'http://graph.test/custom/v26.0/phone%2Fid/register',
    )
    assert.deepEqual(requestJson(requests[0]), {
      messaging_product: 'whatsapp',
      pin: '123456',
      data_localization_region: 'BR',
    })
    assert.equal(requests[0]?.init?.signal, controller.signal)
    assert.equal(
      requestUrl(requests[1]).href,
      'http://graph.test/custom/v26.0/phone%2Fid/deregister',
    )
    assert.equal(requests[1]?.init?.body, undefined)
    for (const request of requests) {
      assert.equal(request.init?.method, 'POST')
      assert.equal(
        new Headers(request.init?.headers).get('authorization'),
        'Bearer access-secret',
      )
    }
  })

  it('gets phone-number registration and verification status', async () => {
    const { client, requests } = clientWith([
      response({
        id: 'phone/id',
        display_phone_number: '+55 11 99999-9999',
        verified_name: 'Example',
        quality_rating: 'GREEN',
        code_verification_status: 'VERIFIED',
        name_status: 'APPROVED',
        status: 'CONNECTED',
        future_field: true,
      }),
    ])

    const phone = await client.getPhoneNumber({
      fields: ['status', 'code_verification_status', 'name_status'],
    })

    assert.equal(phone.code_verification_status, 'VERIFIED')
    assert.equal(phone.future_field, true)
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'status,code_verification_status,name_status',
    )
    assert.equal(requests[0]?.init?.method, 'GET')
  })

  it('requests and verifies ownership codes and changes the two-step PIN', async () => {
    const { client, requests } = clientWith([
      response({ success: true }),
      response({ success: true, id: 'phone/id' }),
      response({ success: true }),
    ])

    await client.requestVerificationCode({
      code_method: 'VOICE',
      language: 'pt_BR',
    })
    assert.deepEqual(await client.verifyCode({ code: '654321' }), {
      success: true,
      id: 'phone/id',
    })
    await client.setTwoStepVerificationPin({ pin: '112233' })

    assert.equal(
      requestUrl(requests[0]).pathname.endsWith('/request_code'),
      true,
    )
    assert.deepEqual(requestJson(requests[0]), {
      code_method: 'VOICE',
      language: 'pt_BR',
    })
    assert.equal(
      requestUrl(requests[1]).pathname.endsWith('/verify_code'),
      true,
    )
    assert.deepEqual(requestJson(requests[1]), { code: '654321' })
    assert.equal(
      requestUrl(requests[2]).href,
      'http://graph.test/custom/v26.0/phone%2Fid',
    )
    assert.deepEqual(requestJson(requests[2]), { pin: '112233' })
  })

  it('validates configuration and registration inputs without a request', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({ success: true }))
    }

    assert.throws(
      () =>
        createWhatsAppRegistrationClient({
          accessToken: '',
          phoneNumberId: 'phone-id',
          fetch,
        }),
      /accessToken/,
    )
    const client = createWhatsAppRegistrationClient({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      fetch,
    })
    assert.throws(() => client.register({ pin: '12345' }), /exactly 6 digits/)
    assert.throws(
      () =>
        client.requestVerificationCode({
          code_method: 'EMAIL' as 'SMS',
          language: 'en_US',
        }),
      /SMS or VOICE/,
    )
    await assert.rejects(
      client.verifyCode({ code: 'abcdef' }),
      /exactly 6 digits/,
    )
    assert.equal(calls, 0)
  })

  it('surfaces structured Graph errors and rejects malformed successes', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Registration request limit reached',
            type: 'OAuthException',
            code: 133016,
            error_subcode: 2446079,
            fbtrace_id: 'trace-id',
            is_transient: false,
            error_user_title: 'Try later',
            error_user_msg: 'Wait before retrying.',
          },
        },
        429,
      ),
      response({ success: false }),
      new Response('not-json', { status: 200 }),
    ])

    await assert.rejects(client.deregister(), (error: unknown) => {
      assert.ok(error instanceof WhatsAppRegistrationApiError)
      assert.equal(error.status, 429)
      assert.equal(error.code, 133016)
      assert.equal(error.subcode, 2446079)
      assert.equal(error.traceId, 'trace-id')
      assert.equal(error.isTransient, false)
      assert.equal(error.userTitle, 'Try later')
      assert.equal(JSON.stringify(error).includes('access-secret'), false)
      return true
    })
    await assert.rejects(client.deregister(), WhatsAppRegistrationResponseError)
    await assert.rejects(client.deregister(), WhatsAppRegistrationResponseError)
  })
})
