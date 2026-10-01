import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppFlowsClient,
  WhatsAppFlowsApiError,
  WhatsAppFlowsResponseError,
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

function requestForm(request: RecordedRequest | undefined): FormData {
  const body = request?.init?.body
  if (!(body instanceof FormData)) throw new TypeError('Expected form data')
  return body
}

function clientWith(responses: Response[]) {
  const recorded = recordingFetch(responses)
  return {
    ...recorded,
    client: createWhatsAppFlowsClient({
      accessToken: 'access-secret',
      wabaId: 'waba/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppFlowsClient', () => {
  it('creates, lists, and retrieves Flows', async () => {
    const flow = {
      id: 'flow-id',
      name: 'Booking',
      status: 'DRAFT',
      categories: ['APPOINTMENT_BOOKING'],
      validation_errors: [],
    }
    const { client, requests } = clientWith([
      response({ id: 'flow-id' }),
      response({ data: [flow], paging: { cursors: { after: 'next' } } }),
      response(flow),
    ])

    assert.deepEqual(
      await client.create({
        name: 'Booking',
        categories: ['APPOINTMENT_BOOKING'],
        clone_flow_id: 'source-flow',
        endpoint_uri: 'https://flows.example.test/data',
      }),
      { id: 'flow-id' },
    )
    const createForm = requestForm(requests[0])
    assert.equal(createForm.get('name'), 'Booking')
    assert.equal(createForm.get('categories'), '["APPOINTMENT_BOOKING"]')
    assert.equal(createForm.get('clone_flow_id'), 'source-flow')
    assert.equal(
      createForm.get('endpoint_uri'),
      'https://flows.example.test/data',
    )
    assert.equal(
      requestUrl(requests[0]).href,
      'http://graph.test/custom/v26.0/waba%2Fid/flows',
    )

    const page = await client.list({
      fields: ['id', 'name', 'status'],
      limit: 10,
      after: 'cursor',
    })
    assert.equal(page.data[0]?.name, 'Booking')
    const listUrl = requestUrl(requests[1])
    assert.equal(listUrl.searchParams.get('fields'), 'id,name,status')
    assert.equal(listUrl.searchParams.get('limit'), '10')
    assert.equal(listUrl.searchParams.get('after'), 'cursor')

    assert.equal(
      (
        await client.get('flow/id', {
          fields: ['id', 'name', 'validation_errors'],
        })
      ).id,
      'flow-id',
    )
    assert.equal(requestUrl(requests[2]).pathname, '/custom/v26.0/flow%2Fid')
  })

  it('gets preview links and migrates selected Flows', async () => {
    const { client, requests } = clientWith([
      response({
        id: 'flow-id',
        preview: {
          preview_url: 'https://business.facebook.com/preview',
          expires_at: 1_790_000_000,
        },
      }),
      response({
        migrated_flows: [
          {
            source_id: 'source-id',
            source_name: 'booking',
            migrated_id: 'migrated-id',
          },
        ],
        failed_flows: [
          {
            source_name: 'missing',
            error_code: '4233041',
            error_message: 'Flow name not found',
          },
        ],
      }),
    ])

    const preview = await client.getPreview('flow-id', {
      invalidate: true,
      unixTimestamp: true,
    })
    assert.equal(preview.preview.expires_at, 1_790_000_000)
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'preview.invalidate(true)',
    )
    assert.equal(requestUrl(requests[0]).searchParams.get('date_format'), 'U')

    const migration = await client.migrate({
      source_waba_id: 'source-waba',
      source_flow_names: ['booking', 'missing'],
    })
    assert.equal(migration.migrated_flows[0]?.migrated_id, 'migrated-id')
    const migrateForm = requestForm(requests[1])
    assert.equal(migrateForm.get('source_waba_id'), 'source-waba')
    assert.equal(migrateForm.get('source_flow_names'), '["booking","missing"]')
  })

  it('updates metadata and manages the Flow JSON asset', async () => {
    const { client, requests } = clientWith([
      response({ success: true }),
      response({
        success: true,
        validation_errors: [
          { error: 'INVALID_PROPERTY', message: 'Unknown component' },
        ],
      }),
      response({
        data: [
          {
            name: 'flow.json',
            asset_type: 'FLOW_JSON',
            download_url: 'https://cdn.example.test/flow.json',
          },
        ],
      }),
    ])

    await client.updateMetadata('flow-id', {
      name: 'Updated booking',
      categories: ['APPOINTMENT_BOOKING', 'OTHER'],
      endpoint_uri: 'https://flows.example.test/v2',
    })
    const metadataForm = requestForm(requests[0])
    assert.equal(metadataForm.get('name'), 'Updated booking')
    assert.equal(
      metadataForm.get('categories'),
      '["APPOINTMENT_BOOKING","OTHER"]',
    )

    const upload = await client.uploadJson('flow-id', {
      file: new Blob(['{"version":"7.1"}'], { type: 'application/json' }),
    })
    assert.equal(upload.validation_errors[0]?.error, 'INVALID_PROPERTY')
    const uploadForm = requestForm(requests[1])
    assert.equal(uploadForm.get('name'), 'flow.json')
    assert.equal(uploadForm.get('asset_type'), 'FLOW_JSON')
    assert.ok(uploadForm.get('file') instanceof Blob)

    const assets = await client.listAssets('flow-id')
    assert.equal(assets.data[0]?.asset_type, 'FLOW_JSON')
    assert.equal(requests[2]?.init?.method, 'GET')
  })

  it('publishes, deprecates, and deletes Flows', async () => {
    const { client, requests } = clientWith([
      response({ success: true }),
      response({ success: true }),
      response({ success: true }),
    ])

    await client.publish('flow-id')
    await client.deprecate('flow-id')
    await client.delete('flow-id')

    assert.deepEqual(
      requests.map((request) => requestUrl(request).pathname),
      [
        '/custom/v26.0/flow-id/publish',
        '/custom/v26.0/flow-id/deprecate',
        '/custom/v26.0/flow-id',
      ],
    )
    assert.deepEqual(
      requests.map((request) => request.init?.method),
      ['POST', 'POST', 'DELETE'],
    )
  })

  it('retrieves endpoint metrics and manages encryption keys', async () => {
    const { client, requests } = clientWith([
      response({
        id: 'flow-id',
        metric: {
          name: 'ENDPOINT_REQUEST_COUNT',
          granularity: 'DAY',
          data_points: [
            {
              timestamp: '2026-09-01T00:00:00+0000',
              data: [{ key: 'value', value: 42 }],
            },
          ],
        },
      }),
      response({
        data: [
          {
            business_public_key: '-----BEGIN PUBLIC KEY-----\nkey',
            business_public_key_signature_status: 'VALID',
          },
        ],
      }),
      response({ success: true }),
    ])

    const metric = await client.getMetric('flow-id', {
      name: 'ENDPOINT_REQUEST_COUNT',
      granularity: 'DAY',
      since: new Date('2026-09-01T12:00:00Z'),
      until: '2026-09-02',
    })
    assert.equal(metric.metric.data_points[0]?.data[0]?.value, 42)
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'metric.name(ENDPOINT_REQUEST_COUNT).granularity(DAY).since(2026-09-01).until(2026-09-02)',
    )

    const keys = await client.getEncryptionPublicKey('phone/id')
    assert.equal(keys.data[0]?.business_public_key_signature_status, 'VALID')
    assert.equal(
      requestUrl(requests[1]).pathname,
      '/custom/v26.0/phone%2Fid/whatsapp_business_encryption',
    )

    await client.setEncryptionPublicKey('phone/id', {
      business_public_key: '-----BEGIN PUBLIC KEY-----\nnew-key',
    })
    assert.equal(
      requestForm(requests[2]).get('business_public_key'),
      '-----BEGIN PUBLIC KEY-----\nnew-key',
    )
  })

  it('validates inputs and surfaces malformed or failed responses', async () => {
    let calls = 0
    const validationClient = createWhatsAppFlowsClient({
      accessToken: 'token',
      wabaId: 'waba-id',
      fetch: () => {
        calls += 1
        return Promise.resolve(response({ success: true }))
      },
    })
    await assert.rejects(
      validationClient.create({ name: 'Empty', categories: [] }),
      /at least one valid/,
    )
    await assert.rejects(
      validationClient.updateMetadata('flow-id', {}),
      /at least one field/,
    )
    await assert.rejects(
      validationClient.create({
        name: 'Bad endpoint',
        categories: ['OTHER'],
        endpoint_uri: 'file:///tmp/endpoint',
      }),
      /http or https/,
    )
    assert.equal(calls, 0)

    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Flow is immutable',
            type: 'OAuthException',
            code: 100,
            error_subcode: 139001,
            fbtrace_id: 'trace-id',
          },
        },
        400,
      ),
      response({ data: 'not-an-array' }),
      new Response('not-json', { status: 200 }),
    ])
    await assert.rejects(client.publish('flow-id'), (error: unknown) => {
      assert.ok(error instanceof WhatsAppFlowsApiError)
      assert.equal(error.status, 400)
      assert.equal(error.code, 100)
      assert.equal(error.subcode, 139001)
      assert.equal(error.traceId, 'trace-id')
      assert.equal(JSON.stringify(error).includes('access-secret'), false)
      return true
    })
    await assert.rejects(client.list(), WhatsAppFlowsResponseError)
    await assert.rejects(client.list(), WhatsAppFlowsResponseError)
  })
})
