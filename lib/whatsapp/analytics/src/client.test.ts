import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppAnalyticsClient,
  WhatsAppAnalyticsApiError,
  WhatsAppAnalyticsResponseError,
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
    client: createWhatsAppAnalyticsClient({
      accessToken: 'test-token',
      wabaId: 'waba/id',
      graphApiBaseUrl: 'http://graph.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

const series = { data: [{ data_points: [{ start: 10, end: 20 }] }] }

describe('WhatsAppAnalyticsClient', () => {
  it('queries messaging and conversation analytics using field expansions', async () => {
    const controller = new AbortController()
    const { client, requests } = clientWith([
      response({
        id: 'waba/id',
        analytics: {
          phone_numbers: ['15550001111'],
          country_codes: ['US'],
          granularity: 'DAY',
          data_points: [{ start: 10, end: 20, sent: 3, delivered: 2 }],
        },
      }),
      response({ id: 'waba/id', conversation_analytics: series }),
    ])

    const messaging = await client.getMessagingAnalytics({
      start: 10,
      end: 20,
      granularity: 'DAY',
      phoneNumbers: [],
      productTypes: [0, 2, 100],
      countryCodes: ['US', 'BR'],
      signal: controller.signal,
    })
    assert.equal(messaging.analytics.data_points[0]?.sent, 3)
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'analytics.start(10).end(20).granularity(DAY).phone_numbers([]).product_types([0,2,100]).country_codes(["US","BR"])',
    )
    assert.equal(requests[0]?.init?.signal, controller.signal)

    await client.getConversationAnalytics({
      start: 10,
      end: 20,
      granularity: 'MONTHLY',
      metricTypes: ['COST', 'CONVERSATION'],
      conversationCategories: ['MARKETING'],
      conversationTypes: ['REGULAR'],
      conversationDirections: ['BUSINESS_INITIATED'],
      dimensions: ['CONVERSATION_CATEGORY', 'PHONE'],
    })
    assert.equal(
      requestUrl(requests[1]).searchParams.get('fields'),
      'conversation_analytics.start(10).end(20).granularity(MONTHLY).metric_types(["COST","CONVERSATION"]).conversation_categories(["MARKETING"]).conversation_types(["REGULAR"]).conversation_directions(["BUSINESS_INITIATED"]).dimensions(["CONVERSATION_CATEGORY","PHONE"])',
    )
    assert.deepEqual(requests[1]?.init?.headers, {
      authorization: 'Bearer test-token',
    })
  })

  it('queries the documented pricing and call analytics fields', async () => {
    const { client, requests } = clientWith([
      response({ pricing_analytics: series }),
      response({
        id: 'waba/id',
        call_analytics: {
          granularity: 'DAILY',
          data_points: [{ start: 10, end: 20, count: 3, average_duration: 42 }],
        },
      }),
    ])

    await client.getPricingAnalytics({
      start: 10,
      end: 20,
      granularity: 'DAILY',
      metricTypes: ['COST', 'VOLUME'],
      pricingTypes: ['REGULAR'],
      pricingCategories: ['MARKETING_LITE'],
      dimensions: ['PRICING_CATEGORY', 'TIER'],
    })
    assert.equal(
      requestUrl(requests[0]).searchParams.get('fields'),
      'pricing_analytics.start(10).end(20).granularity(DAILY).metric_types(["COST","VOLUME"]).pricing_types(["REGULAR"]).pricing_categories(["MARKETING_LITE"]).dimensions(["PRICING_CATEGORY","TIER"])',
    )

    const calls = await client.getCallAnalytics({
      start: 10,
      end: 20,
      granularity: 'HALF_HOUR',
      directions: ['USER_INITIATED'],
      dimensions: ['DIRECTION'],
      metricTypes: ['COUNT', 'AVERAGE_DURATION'],
    })
    assert.equal(calls.call_analytics.data_points[0]?.average_duration, 42)
    assert.equal(
      requestUrl(requests[1]).searchParams.get('fields'),
      'call_analytics.start(10).end(20).granularity(HALF_HOUR).directions(["USER_INITIATED"]).dimensions(["DIRECTION"]).metric_types(["COUNT","AVERAGE_DURATION"])',
    )
  })

  it('queries template, template-group, and group analytics edges', async () => {
    const { client, requests } = clientWith([
      response({
        data: [
          {
            granularity: 'DAILY',
            data_points: [
              { template_id: '101', start: 10, end: 20, delivered: 2 },
            ],
          },
        ],
      }),
      response({
        data: [
          {
            granularity: 'DAILY',
            data_points: [
              { template_group_id: '201', start: 10, end: 20, read: 2 },
            ],
          },
        ],
      }),
      response({
        data: [
          {
            granularity: 'DAILY',
            data_points: [
              { group_id: 'group-1', start: 10, end: 20, joined: 1 },
            ],
          },
        ],
      }),
    ])

    await client.getTemplateAnalytics({
      start: '2026-01-01',
      end: '2026-01-02',
      granularity: 'DAILY',
      templateIds: ['101', '102'],
      metricTypes: ['SENT', 'DELIVERED', 'CLICKED'],
      productType: 'CLOUD_API',
      useWabaTimezone: true,
    })
    const templateUrl = requestUrl(requests[0])
    assert.equal(
      templateUrl.pathname,
      '/custom/v26.0/waba%2Fid/template_analytics',
    )
    assert.equal(templateUrl.searchParams.get('template_ids'), '[101,102]')
    assert.equal(
      templateUrl.searchParams.get('metric_types'),
      'sent,delivered,clicked',
    )
    assert.equal(templateUrl.searchParams.get('product_type'), 'cloud_api')
    assert.equal(templateUrl.searchParams.get('use_waba_timezone'), 'true')

    await client.getTemplateGroupAnalytics({
      start: 10,
      end: 20,
      granularity: 'DAILY',
      templateGroupIds: ['201'],
      metricTypes: ['READ'],
    })
    const templateGroupUrl = requestUrl(requests[1])
    assert.equal(
      templateGroupUrl.pathname,
      '/custom/v26.0/waba%2Fid/template_group_analytics',
    )
    assert.equal(
      templateGroupUrl.searchParams.get('template_group_ids'),
      '[201]',
    )
    assert.equal(templateGroupUrl.searchParams.get('metric_types'), 'read')

    await client.getGroupAnalytics({
      start: 10,
      end: 20,
      groupIds: ['group-1'],
      metricTypes: ['SENT', 'PARTICIPANTS_JOINED'],
    })
    const groupUrl = requestUrl(requests[2])
    assert.equal(groupUrl.pathname, '/custom/v26.0/waba%2Fid/group_analytics')
    assert.equal(groupUrl.searchParams.get('granularity'), 'daily')
    assert.equal(groupUrl.searchParams.get('group_ids'), '["group-1"]')
    assert.equal(
      groupUrl.searchParams.get('metric_types'),
      '["SENT","PARTICIPANTS_JOINED"]',
    )
  })

  it('enables the irreversible template analytics setting explicitly', async () => {
    const { client, requests } = clientWith([response({ id: 12345 })])

    assert.deepEqual(await client.enableTemplateAnalytics(), { id: '12345' })
    const url = requestUrl(requests[0])
    assert.equal(url.pathname, '/custom/v26.0/waba%2Fid')
    assert.equal(url.searchParams.get('is_enabled_for_insights'), 'true')
    assert.equal(requests[0]?.init?.method, 'POST')
  })

  it('validates date ranges, timezone dates, and documented ID limits', async () => {
    const { client, requests } = clientWith([])

    await assert.rejects(
      client.getMessagingAnalytics({
        start: 20,
        end: 10,
        granularity: 'DAY',
      }),
      /end must be greater than start/,
    )
    await assert.rejects(
      client.getTemplateAnalytics({
        start: 10,
        end: 20,
        granularity: 'DAILY',
        templateIds: ['101'],
        useWabaTimezone: true,
      }),
      /must use YYYY-MM-DD/,
    )
    await assert.rejects(
      client.getTemplateGroupAnalytics({
        start: 10,
        end: 20,
        granularity: 'DAILY',
        templateGroupIds: [],
      }),
      /at least 1 value/,
    )
    await assert.rejects(
      client.getGroupAnalytics({
        start: 10,
        end: 20,
        groupIds: ['one', 'two'],
        metricTypes: ['SENT'],
      }),
      /at most 1 value/,
    )
    assert.equal(requests.length, 0)
  })

  it('surfaces Graph API errors and rejects malformed successful responses', async () => {
    const { client } = clientWith([
      response(
        {
          error: {
            message: 'Analytics unavailable',
            type: 'OAuthException',
            code: 100,
            error_subcode: 33,
            fbtrace_id: 'trace-id',
          },
        },
        400,
      ),
      response({ data: [{ missing_data_points: [] }] }),
    ])

    await assert.rejects(
      client.getPricingAnalytics({
        start: 10,
        end: 20,
        granularity: 'DAILY',
      }),
      (error: unknown) => {
        assert.ok(error instanceof WhatsAppAnalyticsApiError)
        assert.equal(error.message, 'Analytics unavailable')
        assert.equal(error.status, 400)
        assert.equal(error.code, 100)
        assert.equal(error.subcode, 33)
        assert.equal(error.errorType, 'OAuthException')
        assert.equal(error.traceId, 'trace-id')
        return true
      },
    )

    await assert.rejects(
      client.getTemplateAnalytics({
        start: 10,
        end: 20,
        granularity: 'DAILY',
        templateIds: ['101'],
      }),
      WhatsAppAnalyticsResponseError,
    )
  })

  it('validates client configuration without making a request', () => {
    assert.throws(
      () => createWhatsAppAnalyticsClient({ accessToken: '', wabaId: 'waba' }),
      /accessToken/,
    )
    assert.throws(
      () =>
        createWhatsAppAnalyticsClient({
          accessToken: 'token',
          wabaId: 'waba',
          graphApiVersion: '26',
        }),
      /graphApiVersion/,
    )
    assert.throws(
      () =>
        createWhatsAppAnalyticsClient({
          accessToken: 'token',
          wabaId: 'waba',
          graphApiBaseUrl: 'file:///tmp/graph',
        }),
      /graphApiBaseUrl/,
    )
  })
})
