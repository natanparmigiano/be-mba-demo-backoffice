import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createResponsesRoute, type ResponsesAuditEntry } from './responses.js'

describe('Responses API provider proxy', () => {
  it('requires a browser session', async () => {
    const route = createResponsesRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      authorize: async () => undefined,
    })

    const response = await route.request('/responses', { method: 'POST' })

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), {
      error: { message: 'Unauthorized', type: 'auth_error' },
    })
  })

  it('injects the provider key and streams Responses API traffic', async () => {
    let upstreamRequest: Request | undefined
    const route = createResponsesRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'provider-secret',
      authorize: async () => ({ safetyIdentifier: 'user-123' }),
      audit: async () => {},
      fetch: async (input, init) => {
        upstreamRequest = new Request(input, init)
        return new Response('data: {"type":"response.completed"}\n\n', {
          headers: {
            'content-type': 'text/event-stream',
            'set-cookie': 'provider=secret',
          },
        })
      },
    })

    const response = await route.request('/responses?stream=true', {
      method: 'POST',
      headers: {
        authorization: 'Bearer browser-value',
        cookie: 'session=browser-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'test-model', input: 'hello' }),
    })

    assert.equal(
      upstreamRequest?.url,
      'https://provider.example/v1/responses?stream=true',
    )
    assert.equal(
      upstreamRequest?.headers.get('authorization'),
      'Bearer provider-secret',
    )
    assert.equal(upstreamRequest?.headers.get('cookie'), null)
    assert.deepEqual(await upstreamRequest?.json(), {
      model: 'test-model',
      input: 'hello',
      safety_identifier: 'user-123',
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/event-stream')
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(
      await response.text(),
      'data: {"type":"response.completed"}\n\n',
    )
  })

  it('forwards realtime HTTP negotiation endpoints', async () => {
    let upstreamUrl = ''
    const route = createResponsesRoute({
      apiBaseUrl: 'https://provider.example/v1/',
      apiKey: 'provider-secret',
      authorize: async () => ({ safetyIdentifier: 'user-123' }),
      fetch: async (input) => {
        upstreamUrl = String(input)
        return new Response('{"client_secret":{"value":"ephemeral"}}', {
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    const response = await route.request('/realtime/client_secrets', {
      method: 'POST',
      body: '{}',
    })

    assert.equal(
      upstreamUrl,
      'https://provider.example/v1/realtime/client_secrets',
    )
    assert.equal(response.status, 200)
  })

  it('audits Responses requests, output, identity, timing, and token usage', async () => {
    let auditEntry: ResponsesAuditEntry | undefined
    const route = createResponsesRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'provider-secret',
      authorize: async () => ({
        safetyIdentifier: 'user-123',
        userId: 'user-123',
        organizationId: 'org-456',
        sessionId: 'session-789',
      }),
      audit: async (entry) => {
        auditEntry = entry
      },
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: 'resp_123',
            output: [{ type: 'message', content: 'hello' }],
            usage: {
              input_tokens: 12,
              output_tokens: 7,
              total_tokens: 19,
              input_tokens_details: { cached_tokens: 2 },
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    })

    const response = await route.request('/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-test',
        input: [{ role: 'user', content: 'hi' }],
      }),
    })
    await response.text()

    assert.ok(auditEntry)
    assert.equal(auditEntry.userId, 'user-123')
    assert.equal(auditEntry.organizationId, 'org-456')
    assert.equal(auditEntry.sessionId, 'session-789')
    assert.deepEqual(auditEntry.authenticationState, {
      authenticated: true,
      method: 'session',
    })
    assert.equal(auditEntry.model, 'gpt-test')
    assert.equal(auditEntry.providerStatus, 200)
    assert.equal(auditEntry.inputTokens, 12)
    assert.equal(auditEntry.outputTokens, 7)
    assert.equal(auditEntry.totalTokens, 19)
    assert.deepEqual(auditEntry.input, {
      model: 'gpt-test',
      input: [{ role: 'user', content: 'hi' }],
    })
    assert.deepEqual(auditEntry.output, {
      id: 'resp_123',
      output: [{ type: 'message', content: 'hello' }],
      usage: {
        input_tokens: 12,
        output_tokens: 7,
        total_tokens: 19,
        input_tokens_details: { cached_tokens: 2 },
      },
    })
    assert.ok(auditEntry.completedAt >= auditEntry.requestedAt)
    assert.ok(auditEntry.durationMs >= 0)
  })

  it('does not audit realtime negotiation traffic', async () => {
    let auditCalls = 0
    const route = createResponsesRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'provider-secret',
      authorize: async () => ({ safetyIdentifier: 'user-123' }),
      audit: async () => {
        auditCalls += 1
      },
      fetch: async () => new Response('{}'),
    })

    const response = await route.request('/realtime/client_secrets', {
      method: 'POST',
      body: '{}',
    })
    await response.text()

    assert.equal(auditCalls, 0)
  })
})
