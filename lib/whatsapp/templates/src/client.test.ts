import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppTemplatesClient,
  WhatsAppTemplatesApiError,
  WhatsAppTemplatesResponseError,
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
    client: createWhatsAppTemplatesClient({
      accessToken: 'test-token',
      wabaId: 'waba/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

describe('WhatsAppTemplatesClient', () => {
  it('creates custom and library templates', async () => {
    const { client, requests } = clientWith([
      response({ id: '1', status: 'PENDING', category: 'UTILITY' }),
      response({ id: '2', status: 'APPROVED', category: 'UTILITY' }),
    ])

    assert.equal(
      (
        await client.create({
          name: 'delivery_update',
          language: 'en_US',
          category: 'UTILITY',
          parameter_format: 'NAMED',
          cta_url_link_tracking_opted_out: false,
          message_send_ttl_seconds: 3600,
          is_primary_device_delivery_only: true,
          components: [
            {
              type: 'BODY',
              text: 'Order {{order_number}} is ready.',
              example: {
                body_text_named_params: [
                  { param_name: 'order_number', example: '1234' },
                ],
              },
            },
          ],
        })
      ).id,
      '1',
    )
    assert.equal(
      (
        await client.createFromLibrary({
          name: 'library_delivery_update',
          language: 'en_US',
          category: 'UTILITY',
          library_template_name: 'delivery_update_1',
          library_template_button_inputs: [
            {
              type: 'URL',
              url: {
                base_url: 'https://example.test/orders/{{1}}',
                url_suffix_example: 'https://example.test/orders/1234',
              },
            },
          ],
        })
      ).status,
      'APPROVED',
    )

    for (const request of requests) {
      assert.equal(
        requestUrl(request).href,
        'http://graph.test/custom/v26.0/waba%2Fid/message_templates',
      )
      assert.equal(request.init?.method, 'POST')
    }
    assert.deepEqual(requestJson(requests[1]), {
      name: 'library_delivery_update',
      language: 'en_US',
      category: 'UTILITY',
      library_template_name: 'delivery_update_1',
      library_template_button_inputs: [
        {
          type: 'URL',
          url: {
            base_url: 'https://example.test/orders/{{1}}',
            url_suffix_example: 'https://example.test/orders/1234',
          },
        },
      ],
    })
  })

  it('lists, gets, and updates templates', async () => {
    const template = {
      id: 'template-id',
      name: 'delivery_update',
      language: 'en_US',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'Ready' }],
    }
    const { client, requests } = clientWith([
      response({ data: [template], paging: { cursors: { after: 'next' } } }),
      response(template),
      response({ success: true }),
    ])

    const page = await client.list({
      fields: ['name', 'status'],
      name: 'delivery_update',
      category: 'UTILITY',
      status: 'APPROVED',
      limit: 5,
      after: 'cursor',
    })
    assert.equal(page.data[0]?.id, 'template-id')
    const listUrl = requestUrl(requests[0])
    assert.equal(listUrl.searchParams.get('fields'), 'name,status')
    assert.equal(listUrl.searchParams.get('name'), 'delivery_update')
    assert.equal(listUrl.searchParams.get('category'), 'UTILITY')
    assert.equal(listUrl.searchParams.get('status'), 'APPROVED')
    assert.equal(listUrl.searchParams.get('limit'), '5')
    assert.equal(listUrl.searchParams.get('after'), 'cursor')

    assert.equal(
      (await client.get('template/id', { fields: ['name', 'components'] })).id,
      'template-id',
    )
    assert.equal(
      requestUrl(requests[1]).href,
      'http://graph.test/custom/v26.0/template%2Fid?fields=name%2Ccomponents',
    )

    assert.deepEqual(
      await client.update('template-id', {
        message_send_ttl_seconds: 3600,
        cta_url_link_tracking_opted_out: true,
      }),
      { success: true },
    )
    assert.deepEqual(requestJson(requests[2]), {
      message_send_ttl_seconds: 3600,
      cta_url_link_tracking_opted_out: true,
    })
  })

  it('deletes by name, ID, and up to 100 IDs', async () => {
    const { client, requests } = clientWith([
      response({ success: true }),
      response({ success: true }),
      response({ success: true }),
    ])

    await client.deleteByName('delivery_update')
    await client.deleteById('1', 'delivery_update')
    await client.deleteByIds(['1', '2'])

    assert.equal(
      requestUrl(requests[0]).searchParams.get('name'),
      'delivery_update',
    )
    assert.equal(requestUrl(requests[1]).searchParams.get('hsm_id'), '1')
    assert.equal(
      requestUrl(requests[1]).searchParams.get('name'),
      'delivery_update',
    )
    assert.equal(
      requestUrl(requests[2]).searchParams.get('hsm_ids'),
      '["1","2"]',
    )
    requests.forEach((request) => assert.equal(request.init?.method, 'DELETE'))
  })

  it('gets the namespace and bulk-upserts authentication templates', async () => {
    const { client, requests } = clientWith([
      response({ id: 'waba/id', message_template_namespace: 'namespace' }),
      response({
        data: [
          { id: '1', status: 'APPROVED', language: 'en_US' },
          { id: '2', status: 'APPROVED', language: 'pt_BR' },
        ],
      }),
    ])

    assert.equal(
      (await client.getNamespace()).message_template_namespace,
      'namespace',
    )
    const upserted = await client.upsertAuthentication({
      name: 'login_code',
      languages: ['en_US', 'pt_BR'],
      category: 'AUTHENTICATION',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: 10 },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }],
        },
      ],
    })
    assert.equal(upserted.data.length, 2)
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'message_template_namespace',
    )
    assert.equal(
      requestUrl(requests[1]).pathname,
      '/custom/v26.0/waba%2Fid/upsert_message_templates',
    )
  })

  it('migrates templates and browses the template library', async () => {
    const { client, requests } = clientWith([
      response({
        migrated_templates: ['1', '2'],
        failed_templates: { '3': 'Incorrect category' },
      }),
      response({
        data: [
          {
            id: 'library-id',
            name: 'delivery_update_1',
            language: 'en_US',
            category: 'UTILITY',
          },
        ],
      }),
    ])

    const migrated = await client.migrate({
      source_waba_id: 'source-waba',
      page_number: 0,
      count: 200,
      template_ids: ['1', '2', '3'],
    })
    assert.deepEqual(migrated.migrated_templates, ['1', '2'])
    assert.deepEqual(requestJson(requests[0]), {
      source_waba_id: 'source-waba',
      page_number: 0,
      count: 200,
      template_ids: ['1', '2', '3'],
    })

    const library = await client.listLibrary({
      search: 'delivery',
      topic: 'ORDER_MANAGEMENT',
      industry: 'E_COMMERCE',
      language: 'en_US',
    })
    assert.equal(library.data[0]?.name, 'delivery_update_1')
    const libraryUrl = requestUrl(requests[1])
    assert.equal(libraryUrl.pathname, '/custom/v26.0/message_template_library')
    assert.equal(libraryUrl.searchParams.get('search'), 'delivery')
    assert.equal(libraryUrl.searchParams.get('topic'), 'ORDER_MANAGEMENT')
  })

  it('creates, gets, updates, and deletes template groups', async () => {
    const group = { id: 'group-id', name: 'Launch', description: 'Campaign' }
    const { client, requests } = clientWith([
      response({ id: 'group-id' }),
      response(group),
      response({ success: true }),
      response({ success: true }),
    ])

    assert.deepEqual(
      await client.createGroup({
        name: 'Launch',
        description: 'Campaign',
        whatsapp_business_templates: ['1', '2'],
      }),
      { id: 'group-id' },
    )
    assert.equal((await client.getGroup('group-id')).name, 'Launch')
    assert.deepEqual(
      await client.updateGroup('group-id', {
        add_templates: ['3'],
        remove_templates: ['1'],
      }),
      { success: true },
    )
    assert.deepEqual(await client.deleteGroup('group-id'), { success: true })

    assert.equal(
      requestUrl(requests[0]).pathname,
      '/custom/v26.0/waba%2Fid/template_groups',
    )
    assert.equal(requests[1]?.init?.method, 'GET')
    assert.equal(requests[2]?.init?.method, 'POST')
    assert.equal(requests[3]?.init?.method, 'DELETE')
  })

  it('validates limits and surfaces Graph API errors', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Invalid template',
            type: 'OAuthException',
            code: 100,
            error_subcode: 2388024,
            fbtrace_id: 'trace-id',
          },
        },
        400,
      ),
    ])

    await assert.rejects(client.list(), (error: unknown) => {
      assert.ok(error instanceof WhatsAppTemplatesApiError)
      assert.equal(error.message, 'Invalid template')
      assert.equal(error.status, 400)
      assert.equal(error.code, 100)
      assert.equal(error.subcode, 2388024)
      return true
    })
    assert.throws(() => client.deleteByIds([]), /between 1 and 100/)
    await assert.rejects(
      client.create({
        name: 'Invalid Name',
        language: 'en_US',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Hello' }],
      }),
      /lowercase letters/,
    )
  })

  it('rejects malformed successful responses', async () => {
    const { client } = clientWith([response({ data: 'not-an-array' })])
    await assert.rejects(client.list(), WhatsAppTemplatesResponseError)
  })
})
