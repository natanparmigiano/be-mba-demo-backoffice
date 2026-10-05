import { EventType, type RunAgentInput } from '@ag-ui/core'
import type { OpenAITextStreamOptions } from '@hashbrownai/openai'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LlmAuditEntry } from '../llm-audit.js'
import { createHashbrownRoute } from './hashbrown.js'

const input: RunAgentInput = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
}

describe('Hashbrown route', () => {
  it('requires a browser session', async () => {
    const route = createHashbrownRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: 'test-model',
      authorize: async () => undefined,
    })

    const response = await route.request('/', {
      method: 'POST',
      body: JSON.stringify(input),
    })

    assert.equal(response.status, 401)
  })

  it('validates the AG-UI request', async () => {
    const route = createHashbrownRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: 'test-model',
      authorize: async () => ({ safetyIdentifier: 'user-123' }),
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      error: {
        message: 'Invalid AG-UI request',
        type: 'validation_error',
      },
    })
  })

  it('streams provider events with configured credentials and model', async () => {
    let options: OpenAITextStreamOptions | undefined
    let auditEntry: LlmAuditEntry | undefined
    const route = createHashbrownRoute({
      apiBaseUrl: 'https://provider.example/v1',
      apiKey: 'provider-secret',
      model: 'test-model',
      authorize: async () => ({
        safetyIdentifier: 'user-123',
        userId: 'user-123',
        organizationId: 'org-456',
        sessionId: 'session-789',
      }),
      audit: async (entry) => {
        auditEntry = entry
      },
      stream: (streamOptions) => {
        options = streamOptions
        return (async function* () {
          yield {
            type: EventType.RUN_STARTED,
            threadId: input.threadId,
            runId: input.runId,
          }
          yield {
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
            usage: [
              {
                provider: 'openai',
                model: 'test-model',
                inputTokens: 11,
                outputTokens: 5,
                totalTokens: 16,
              },
            ],
          }
        })()
      },
    })

    const response = await route.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /event-stream/)
    assert.equal(options?.apiKey, 'provider-secret')
    assert.equal(options?.baseURL, 'https://provider.example/v1')
    assert.equal(options?.model, 'test-model')
    const transformed = await options?.transformRequestOptions?.({
      model: 'test-model',
      messages: [],
      stream: true,
    })
    assert.equal(transformed?.safety_identifier, 'user-123')
    const body = await response.text()
    assert.match(body, /RUN_STARTED/)
    assert.match(body, /RUN_FINISHED/)
    assert.ok(auditEntry)
    assert.equal(auditEntry.endpoint, 'hashbrown')
    assert.equal(auditEntry.userId, 'user-123')
    assert.equal(auditEntry.organizationId, 'org-456')
    assert.equal(auditEntry.sessionId, 'session-789')
    assert.equal(auditEntry.model, 'test-model')
    assert.equal(auditEntry.streamed, true)
    assert.equal(auditEntry.inputTokens, 11)
    assert.equal(auditEntry.outputTokens, 5)
    assert.equal(auditEntry.totalTokens, 16)
    assert.deepEqual(auditEntry.input, input)
    assert.deepEqual(auditEntry.output, [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        usage: [
          {
            provider: 'openai',
            model: 'test-model',
            inputTokens: 11,
            outputTokens: 5,
            totalTokens: 16,
          },
        ],
      },
    ])
    assert.ok(auditEntry.completedAt >= auditEntry.requestedAt)
  })
})
