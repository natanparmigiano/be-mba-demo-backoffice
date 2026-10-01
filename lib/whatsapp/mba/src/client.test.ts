import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createWhatsAppMbaClient,
  WhatsAppMbaApiError,
  WhatsAppMbaResponseError,
} from './index.js'
import type { ConnectorToolInput, Fetch } from './index.js'

interface RecordedRequest {
  input: string | URL | Request
  init?: RequestInit
}

function response(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status })
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
    client: createWhatsAppMbaClient({
      accessToken: 'access-secret',
      phoneNumberId: 'phone/id',
      businessId: 'business/id',
      apiBaseUrl: 'http://mba.test/custom',
      fetch: recorded.fetch,
    }),
  }
}

const settings = {
  agent_id: 'agent-id',
  channel: 'whatsapp',
  rollout: { enabled: true },
}

const connector = {
  id: 'connector-id',
  name: 'Orders',
  description: 'Order management',
  base_url: 'https://orders.example.test',
  auth_type: 'NONE',
  connection_status: { status: 'ACTIVE' },
}

const connectorTool = {
  id: 'tool-id',
  name: 'lookup_order',
  description: 'Looks up an order',
  request_definition: { method: 'GET', path: '/orders/{order_id}' },
  user_auth_required: false,
}

const skill = {
  id: 'skill-id',
  title: 'greeting-skill',
  description: 'When a conversation begins',
  skill: 'Greet the customer.',
  channel: 'whatsapp',
}

const uiSkill = {
  id: 'ui-skill-id',
  title: 'Learn more',
  component_type: 'cta_url',
  status: 'enabled',
  instruction: 'Send a Learn more button.',
  created_at: 1,
  updated_at: 2,
}

const faq = {
  id: 'faq-id',
  question: 'When are you open?',
  answer: 'Weekdays from 9 to 5.',
}

const knowledgeFile = { id: 'file-id', file_name: 'guide.pdf' }
const website = { id: 'website-id', url: 'https://www.example.test' }

function methodAndPath(request: RecordedRequest): string {
  return `${request.init?.method} ${requestUrl(request).pathname}`
}

function assertCommonHeaders(requests: RecordedRequest[]): void {
  for (const request of requests) {
    const headers = new Headers(request.init?.headers)
    assert.equal(headers.get('authorization'), 'Bearer access-secret')
    assert.equal(headers.get('x-api-version'), '2.0.0')
  }
}

describe('WhatsAppMbaClient', () => {
  it('covers agent configuration, budget, deletion, and testing endpoints', async () => {
    const { client, requests } = clientWith([
      response({ is_eligible: true }),
      response({ agent_id: 'agent-id' }, 201),
      response([settings]),
      response(settings),
      response([{ id: 'allow-id', consumer_phone_number: '+16505551234' }]),
      response({ id: 'allow-id', consumer_phone_number: '+16505551234' }, 201),
      response(undefined, 204),
      response({
        budgets: [
          {
            budget_id: 'budget-id',
            unit_type: 'ai_turn',
            time_window: 'one_day',
            max_budget: 100,
          },
        ],
      }),
      response({ budgets: [] }),
      response({ deleted_agent_id: 'agent-id' }),
      response({
        message_id: 'message-id',
        agent_response: 'We are open from 9 to 5.',
        conversation_id: 'conversation-id',
      }),
    ])

    assert.equal((await client.getEligibility()).is_eligible, true)
    assert.equal((await client.onboard()).agent_id, 'agent-id')
    assert.equal(
      (await client.getSettings({ agentId: 'agent-id' }))[0]?.agent_id,
      'agent-id',
    )
    await client.updateSettings({ rollout: { enabled: true } })
    await client.listAllowlist()
    await client.addAllowlistEntry({ consumer_phone_number: ' +16505551234 ' })
    await client.removeAllowlistEntry('allow/id')
    assert.equal((await client.getBudgets()).budgets.length, 1)
    await client.replaceBudgets([])
    await client.deleteAgent()
    await client.runTest({ user_msg: 'When are you open?' })

    assert.deepEqual(requests.map(methodAndPath), [
      'GET /custom/phone%2Fid/agent_eligibility',
      'POST /custom/phone%2Fid/agent_onboarding',
      'GET /custom/phone%2Fid/agent_config/settings',
      'PUT /custom/phone%2Fid/agent_config/settings',
      'GET /custom/phone%2Fid/agent_config/allowlist',
      'POST /custom/phone%2Fid/agent_config/allowlist',
      'DELETE /custom/phone%2Fid/agent_config/allowlist/allow%2Fid',
      'GET /custom/business%2Fid/agent_budget',
      'POST /custom/business%2Fid/agent_budget',
      'DELETE /custom/phone%2Fid/delete_agent',
      'POST /custom/phone%2Fid/agent_test',
    ])
    assert.equal(
      requestUrl(requests[2]).searchParams.get('agent_id'),
      'agent-id',
    )
    assert.deepEqual(requestJson(requests[5]), {
      consumer_phone_number: '+16505551234',
    })
    assertCommonHeaders(requests)
  })

  it('covers connector and connector-tool endpoints', async () => {
    const { client, requests } = clientWith([
      response([connector]),
      response(connector),
      response(connector, 201),
      response(connector),
      response(undefined, 204),
      response({ data: [], stats: { start_count: 0 } }),
      response(connector),
      response(connector),
      response(connector),
      response(connector),
      response([connectorTool]),
      response(connectorTool),
      response(connectorTool, 201),
      response(connectorTool),
      response({ output: '{}', status: 'success' }),
      response(undefined, 204),
    ])
    const connectorInput = {
      name: 'Orders',
      description: 'Order management',
      base_url: 'https://orders.example.test',
      auth_type: 'NONE' as const,
    }
    const toolInput = {
      name: 'lookup_order',
      description: 'Looks up an order',
      request_definition: {
        method: 'GET' as const,
        path: '/orders/{order_id}',
      },
      user_auth_required: false,
    }

    await client.listConnectors()
    await client.getConnector('connector/id')
    await client.createConnector(connectorInput)
    await client.updateConnector('connector/id', connectorInput)
    await client.deleteConnector('connector/id')
    await client.getConnectorLogs('connector/id', {
      startTime: 1_800_000_000,
      endTime: 1_800_000_100,
      limit: 25,
      toolId: 'tool/id',
      includeStats: true,
      summaryOnly: false,
      topN: 5,
    })
    await client.refreshMcpTools('connector/id')
    await client.upsertConnectorApiKey('connector/id', {
      api_key_config: {
        headers: [{ field_name: 'X-API-Key', value: 'secret' }],
      },
    })
    await client.upsertConnectorOAuth('connector/id', {
      oauth_config: {
        token_url: 'https://auth.example.test/token',
        scopes_to_request: ['read'],
        client_id: 'client-id',
        client_secret: 'client-secret',
      },
    })
    await client.upsertConnectorCertificate('connector/id', {
      client_certificate: '-----BEGIN CERTIFICATE-----\ncertificate',
      client_key: '-----BEGIN PRIVATE KEY-----\nprivate-key',
    })
    await client.listConnectorTools('connector/id')
    await client.getConnectorTool('connector/id', 'tool/id')
    await client.createConnectorTool('connector/id', toolInput)
    await client.updateConnectorTool('connector/id', 'tool/id', toolInput)
    await client.runConnectorTool('connector/id', 'tool/id', {
      input: { order_id: '123' },
    })
    await client.deleteConnectorTool('connector/id', 'tool/id')

    assert.deepEqual(requests.map(methodAndPath), [
      'GET /custom/phone%2Fid/agent_connectors',
      'GET /custom/phone%2Fid/agent_connectors/connector%2Fid',
      'POST /custom/phone%2Fid/agent_connectors',
      'PUT /custom/phone%2Fid/agent_connectors/connector%2Fid',
      'DELETE /custom/phone%2Fid/agent_connectors/connector%2Fid',
      'GET /custom/phone%2Fid/agent_connectors/connector%2Fid/logs',
      'POST /custom/phone%2Fid/agent_connectors/connector%2Fid/refreshMCPTools',
      'POST /custom/phone%2Fid/agent_connectors/connector%2Fid/upsertApiKey',
      'POST /custom/phone%2Fid/agent_connectors/connector%2Fid/upsertOAuth',
      'POST /custom/phone%2Fid/agent_connectors/connector%2Fid/upsertCertificate',
      'GET /custom/phone%2Fid/agent_connectors/connector%2Fid/tools',
      'GET /custom/phone%2Fid/agent_connectors/connector%2Fid/tools/tool%2Fid',
      'POST /custom/phone%2Fid/agent_connectors/connector%2Fid/tools',
      'PUT /custom/phone%2Fid/agent_connectors/connector%2Fid/tools/tool%2Fid',
      'POST /custom/phone%2Fid/agent_connectors/connector%2Fid/tools/tool%2Fid/run',
      'DELETE /custom/phone%2Fid/agent_connectors/connector%2Fid/tools/tool%2Fid',
    ])
    assert.equal(
      requestUrl(requests[5]).searchParams.get('include_stats'),
      'true',
    )
    assert.deepEqual(requestJson(requests[14]), {
      input: '{"order_id":"123"}',
    })
    assertCommonHeaders(requests)
  })

  it('encodes nested connector body nodes for Meta and decodes the response', async () => {
    const itemNode = {
      type: 'object',
      description: 'A quote line',
      required: ['sku', 'quantity'],
      properties: {
        sku: JSON.stringify({ type: 'string', description: 'Catalog SKU' }),
        quantity: JSON.stringify({
          type: 'integer',
          description: 'Requested quantity',
        }),
      },
    }
    const wireTool = {
      id: 'quote-tool-id',
      name: 'create_quote',
      description: 'Creates a quote',
      request_definition: {
        method: 'POST',
        path: '/quotes',
        body: {
          content_type: 'application/json',
          params: {
            items: {
              type: 'array',
              description: 'Requested items',
              items: JSON.stringify(itemNode),
            },
          },
          required: ['items'],
        },
      },
      user_auth_required: false,
    }
    const input: ConnectorToolInput = {
      name: wireTool.name,
      description: wireTool.description,
      request_definition: {
        method: 'POST',
        path: '/quotes',
        body: {
          content_type: 'application/json',
          params: {
            items: {
              type: 'array',
              description: 'Requested items',
              items: {
                type: 'object',
                description: 'A quote line',
                required: ['sku', 'quantity'],
                properties: {
                  sku: { type: 'string', description: 'Catalog SKU' },
                  quantity: {
                    type: 'integer',
                    description: 'Requested quantity',
                  },
                },
              },
            },
          },
          required: ['items'],
        },
      },
      user_auth_required: false,
    }
    const { client, requests } = clientWith([response(wireTool, 201)])

    const created = await client.createConnectorTool('connector-id', input)

    const sent = requestJson(requests[0]) as {
      request_definition: {
        body: { params: { items: { items: string } } }
      }
    }
    const sentItemNode = JSON.parse(
      sent.request_definition.body.params.items.items,
    ) as { properties: Record<string, string> }
    assert.deepEqual(sentItemNode, itemNode)
    assert.equal(typeof sentItemNode.properties.sku, 'string')
    const createdItems = created.request_definition.body?.params.items
    assert.ok(createdItems)
    assert.deepEqual(createdItems.items, {
      type: 'object',
      description: 'A quote line',
      required: ['sku', 'quantity'],
      properties: {
        sku: { type: 'string', description: 'Catalog SKU' },
        quantity: {
          type: 'integer',
          description: 'Requested quantity',
        },
      },
    })
  })

  it('covers instructions, UI skills, and every knowledge endpoint', async () => {
    const { client, requests } = clientWith([
      response([skill]),
      response(skill),
      response(skill, 201),
      response(skill),
      response(undefined, 204),
      response({ data: [uiSkill], paging: { cursors: {} } }),
      response(uiSkill),
      response(uiSkill, 201),
      response(uiSkill),
      response(undefined, 204),
      response({ business_description: 'Example' }),
      response({ business_description: 'Updated' }),
      response(undefined, 204),
      response([faq]),
      response(faq),
      response(faq, 201),
      response(faq),
      response(undefined, 204),
      response([knowledgeFile]),
      response(knowledgeFile),
      response(knowledgeFile, 201),
      response(undefined, 204),
      response([website]),
      response(website),
      response(website, 201),
      response(website),
      response(undefined, 204),
    ])

    await client.listSkills({ agentId: 'agent-id' })
    await client.getSkill('skill/id')
    await client.createSkill(
      {
        title: 'greeting-skill',
        description: 'When a conversation begins',
        skill: 'Greet the customer.',
      },
      { agentId: 'agent-id' },
    )
    await client.updateSkill('skill/id', { skill: 'Greet warmly.' })
    await client.deleteSkill('skill/id')
    await client.listUiSkills({ limit: 10, after: 'next' })
    await client.getUiSkill('ui/id')
    await client.createUiSkill({
      title: 'Learn more',
      component_type: 'cta_url',
      status: 'enabled',
      instruction: 'Send a Learn more button.',
    })
    await client.updateUiSkill('ui/id', { status: 'disabled' })
    await client.deleteUiSkill('ui/id')
    await client.getBusinessInfo()
    await client.replaceBusinessInfo({ business_description: 'Updated' })
    await client.resetBusinessInfo()
    await client.listFaqs()
    await client.getFaq('faq/id')
    await client.createFaq({
      question: faq.question,
      answer: faq.answer,
    })
    await client.updateFaq('faq/id', {
      question: faq.question,
      answer: faq.answer,
    })
    await client.deleteFaq('faq/id')
    await client.listKnowledgeFiles()
    await client.getKnowledgeFile('file/id')
    await client.uploadKnowledgeFile({
      file: new Blob(['knowledge'], { type: 'application/pdf' }),
      fileName: 'guide.pdf',
    })
    await client.deleteKnowledgeFile('file/id')
    await client.listKnowledgeWebsites()
    await client.getKnowledgeWebsite('website/id')
    await client.createKnowledgeWebsite({ url: website.url })
    await client.updateKnowledgeWebsite('website/id', { url: website.url })
    await client.deleteKnowledgeWebsite('website/id')

    assert.equal(requests.length, 27)
    assert.deepEqual(
      requests.map((request) => request.init?.method),
      [
        'GET',
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'GET',
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'GET',
        'PUT',
        'DELETE',
        'GET',
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'GET',
        'GET',
        'POST',
        'DELETE',
        'GET',
        'GET',
        'POST',
        'PUT',
        'DELETE',
      ],
    )
    assert.deepEqual(
      requests.map((request) => requestUrl(request).pathname),
      [
        '/custom/phone%2Fid/agent_config/skills',
        '/custom/phone%2Fid/agent_config/skills/skill%2Fid',
        '/custom/phone%2Fid/agent_config/skills',
        '/custom/phone%2Fid/agent_config/skills/skill%2Fid',
        '/custom/phone%2Fid/agent_config/skills/skill%2Fid',
        '/custom/phone%2Fid/agent-ui-skills',
        '/custom/phone%2Fid/agent-ui-skills/ui%2Fid',
        '/custom/phone%2Fid/agent-ui-skills',
        '/custom/phone%2Fid/agent-ui-skills/ui%2Fid',
        '/custom/phone%2Fid/agent-ui-skills/ui%2Fid',
        '/custom/phone%2Fid/agent_config/business_info',
        '/custom/phone%2Fid/agent_config/business_info',
        '/custom/phone%2Fid/agent_config/business_info',
        '/custom/phone%2Fid/agent_config/faq',
        '/custom/phone%2Fid/agent_config/faq/faq%2Fid',
        '/custom/phone%2Fid/agent_config/faq',
        '/custom/phone%2Fid/agent_config/faq/faq%2Fid',
        '/custom/phone%2Fid/agent_config/faq/faq%2Fid',
        '/custom/phone%2Fid/agent_config/files',
        '/custom/phone%2Fid/agent_config/files/file%2Fid',
        '/custom/phone%2Fid/agent_config/files',
        '/custom/phone%2Fid/agent_config/files/file%2Fid',
        '/custom/phone%2Fid/agent_config/websites',
        '/custom/phone%2Fid/agent_config/websites/website%2Fid',
        '/custom/phone%2Fid/agent_config/websites',
        '/custom/phone%2Fid/agent_config/websites/website%2Fid',
        '/custom/phone%2Fid/agent_config/websites/website%2Fid',
      ],
    )
    assert.equal(
      requestUrl(requests[0]).searchParams.get('agent_id'),
      'agent-id',
    )
    assert.equal(requestUrl(requests[5]).searchParams.get('limit'), '10')
    assert.ok(requests[20]?.init?.body instanceof FormData)
    assert.equal(
      new Headers(requests[20]?.init?.headers).get('content-type'),
      null,
    )
    assertCommonHeaders(requests)
  })

  it('covers evaluation, events, insights, and thread control endpoints', async () => {
    const controller = new AbortController()
    const { client, requests } = clientWith([
      response({ eval_cases: [{ id: 'case-id', scenario: 'Buy an item' }] }),
      response({ job_id: 'job-id', status: 'QUEUED' }),
      response({ status: 'RUNNING' }),
      response({
        evaluations: [
          {
            id: 'eval-id',
            per_turn_labels: '[]',
            reasons: '[]',
            creation_time: 1,
            update_time: 2,
          },
        ],
      }),
      response({
        insights: [
          {
            id: 'summary-id',
            summary: 'Good result',
            creation_time: 1,
            update_time: 2,
          },
        ],
      }),
      response({ status: 'accepted', agent_event_id: 'event-id' }),
      response({
        status: 'success',
        event_type: 'order_shipped',
        created_at: '2026-09-30T10:00:00Z',
        updated_at: '2026-09-30T10:00:01Z',
      }),
      response({
        data: [
          {
            event_type: 'order_shipped',
            received: 2,
            successfully_processed: 2,
          },
        ],
      }),
      response({
        data: [
          {
            turn_id: 'turn-id',
            conversation_id: 'conversation-id',
            steps: [{ type: 'LLM_CALL' }],
          },
        ],
      }),
      response({ data: [{ ai_threads: { count: 1 } }] }),
      response({ data: [{ tool_name: 'lookup_order', thread_count: 1 }] }),
      response({ messaging_product: 'whatsapp' }),
    ])

    await client.listEvaluationCases()
    await client.runEvaluation({ evalCaseIds: ['case/one', 'case-two'] })
    await client.getEvaluationJob('job/id')
    await client.getEvaluationDetails(['eval/one', 'eval-two'])
    await client.getEvaluationSummaries(['summary/one'])
    await client.sendAgentEvent({
      to: '+16505551234',
      event: {
        type: 'order_shipped',
        description: 'The order shipped.',
        payload: { order_id: '123' },
      },
    })
    await client.getAgentEvent('event/id')
    await client.getAgentEventInsights({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      eventType: 'order_shipped',
    })
    await client.getConversationTurns({
      userPhoneNumber: '16505551234',
      startTimestampMs: 1,
      endTimestampMs: 2,
      limit: 10,
    })
    await client.getConversationInsights({
      startDate: new Date('2026-09-01T12:00:00Z'),
      endDate: '2026-09-30',
      metrics: ['ai_threads', 'ai_handoffs'],
    })
    await client.getToolCallInsights({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      toolName: 'lookup_order',
    })
    await client.transferThreadControl(
      {
        action: 'release',
        to: '16505551234',
      },
      { signal: controller.signal },
    )

    assert.deepEqual(requests.map(methodAndPath), [
      'GET /custom/phone%2Fid/agent-eval/cases',
      'POST /custom/phone%2Fid/agent-eval/run',
      'GET /custom/phone%2Fid/agent-eval/run',
      'GET /custom/phone%2Fid/agent-eval/details',
      'GET /custom/phone%2Fid/agent-eval/summary',
      'POST /custom/phone%2Fid/agent_event',
      'GET /custom/phone%2Fid/agent_event/event%2Fid',
      'GET /custom/phone%2Fid/insights/agent_events',
      'GET /custom/phone%2Fid/insights/conversations/turns',
      'GET /custom/phone%2Fid/insights/conversations',
      'GET /custom/phone%2Fid/insights/tool_calls',
      'POST /custom/business/whatsapp/phone_numbers/phone%2Fid/thread_control',
    ])
    assert.equal(
      requestUrl(requests[1]).searchParams.get('eval_case_ids'),
      'case/one,case-two',
    )
    assert.deepEqual(requestUrl(requests[9]).searchParams.getAll('metrics'), [
      'ai_threads',
      'ai_handoffs',
    ])
    assert.equal(
      new Headers(requests[11]?.init?.headers).get('x-api-version'),
      '1.0.0',
    )
    assert.equal(requests[11]?.init?.signal, controller.signal)
    assertCommonHeaders(requests.slice(0, 11))
  })

  it('validates inputs before network I/O', async () => {
    let calls = 0
    const fetch: Fetch = () => {
      calls += 1
      return Promise.resolve(response({}))
    }
    const client = createWhatsAppMbaClient({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      fetch,
    })

    await assert.rejects(client.getBudgets(), /businessId/)
    await assert.rejects(client.updateSettings({}), /at least one field/)
    await assert.rejects(
      client.replaceBudgets([
        { unit_type: 'ai_turn', time_window: 'one_day', max_budget: 1 },
        { unit_type: 'ai_turn', time_window: 'one_day', max_budget: 2 },
      ]),
      /must not repeat/,
    )
    await assert.rejects(
      client.createConnector({
        name: 'Bad connector',
        description: 'Missing credentials',
        base_url: 'https://example.test',
        auth_type: 'API_KEY',
      }),
      /api_key/,
    )
    await assert.rejects(
      client.uploadKnowledgeFile({
        file: new Blob(['content']),
        fileName: 'knowledge.exe',
      }),
      /supported knowledge file extension/,
    )
    await assert.rejects(
      client.getAgentEventInsights({
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      }),
      /between 1 and 30 days/,
    )
    await assert.rejects(
      client.transferThreadControl({ action: 'take' }),
      /requires to or recipient/,
    )
    await assert.rejects(
      // @ts-expect-error `pass` is intentionally not part of thread control.
      client.transferThreadControl({ action: 'pass', to: '16505551234' }),
      /must be release or take/,
    )
    assert.equal(calls, 0)
  })

  it('validates client configuration and API versions', () => {
    assert.throws(
      () => createWhatsAppMbaClient({ accessToken: '', phoneNumberId: 'id' }),
      /accessToken/,
    )
    assert.throws(
      () =>
        createWhatsAppMbaClient({ accessToken: 'token', phoneNumberId: '' }),
      /phoneNumberId/,
    )
    assert.throws(
      () =>
        createWhatsAppMbaClient({
          accessToken: 'token',
          phoneNumberId: 'id',
          apiVersion: 'v2.0',
        }),
      /2\.0\.0/,
    )
    assert.throws(
      () =>
        createWhatsAppMbaClient({
          accessToken: 'token',
          phoneNumberId: 'id',
          apiBaseUrl: 'file:///tmp/api',
        }),
      /http or https/,
    )
  })

  it('surfaces structured errors without exposing access tokens', async () => {
    const { client } = clientWith([
      response(
        {
          title: 'Too many requests',
          detail: 'The hourly request limit was exceeded.',
          type: 'rate_limit',
          status: 429,
        },
        429,
      ),
      new Response('Internal Server Error', { status: 500 }),
      response({ is_eligible: 'yes' }),
      new Response('not-json', { status: 200 }),
    ])

    await assert.rejects(client.getEligibility(), (error: unknown) => {
      assert.ok(error instanceof WhatsAppMbaApiError)
      assert.equal(error.status, 429)
      assert.equal(error.title, 'Too many requests')
      assert.equal(error.detail, 'The hourly request limit was exceeded.')
      assert.equal(error.errorType, 'rate_limit')
      assert.equal(JSON.stringify(error).includes('access-secret'), false)
      return true
    })
    await assert.rejects(client.getEligibility(), (error: unknown) => {
      assert.ok(error instanceof WhatsAppMbaApiError)
      assert.equal(error.status, 500)
      assert.equal(error.body, 'Internal Server Error')
      assert.equal(
        error.message,
        'Meta Business Agent API request failed with status 500',
      )
      return true
    })
    await assert.rejects(client.getEligibility(), WhatsAppMbaResponseError)
    await assert.rejects(client.getEligibility(), WhatsAppMbaResponseError)
  })
})
