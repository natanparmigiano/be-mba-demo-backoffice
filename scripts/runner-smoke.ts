import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  closeDatabase,
  db,
  organization,
  runnerExecutionLogs,
  runnerFunctionApiKeys,
  runnerFunctions,
  runnerMcps,
} from '@mba-demo/db'
import { and, eq } from 'drizzle-orm'
import { MemoryEventBus } from '@mba-demo/events'
import {
  RUNNER_EXECUTION_REQUESTED_TOPIC,
  Runner,
  createRunnerExecutionPublisher,
  runnerExecutionRequestedSchema,
} from '@mba-demo/runner'
import { createMcpRoute } from '../apps/api/src/routes/mcp.js'
import { createRunnerRoute } from '../apps/api/src/routes/runner.js'

const suffix = randomUUID()
const organizationId = `runner-smoke-${suffix}`
const eventBus = new MemoryEventBus()
const smokeRunner = new Runner({
  executionPublisher: createRunnerExecutionPublisher(eventBus),
})
eventBus.subscribe(RUNNER_EXECUTION_REQUESTED_TOPIC, async (event) => {
  const execution = runnerExecutionRequestedSchema.parse(
    JSON.parse(event.value) as unknown,
  )
  assert.equal(event.key, String(execution.executionId))
  await smokeRunner.executeQueuedExecution(execution.executionId)
})
const route = createRunnerRoute({
  getAccess: async () => ({ organizationId, role: 'owner' }),
  runner: smokeRunner,
})

async function main(): Promise<void> {
  try {
    await eventBus.start()
    await db.insert(organization).values({
      id: organizationId,
      name: 'Runner smoke test',
      slug: organizationId,
      createdAt: new Date(),
    })

    const firstFunction = await createFunction('smoke_primary')
    const secondFunction = await createFunction('smoke_secondary')
    const mcp = await createMcp([firstFunction.id, secondFunction.id])
    const mcpKey = await createApiKey([], 'mcp', [mcp.id])
    const mcpRoute = createMcpRoute({
      allowedHosts: ['localhost'],
      runner: smokeRunner,
    })
    const listedTools = await requestMcp(mcpRoute, mcp.id, mcpKey.apiKey, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })
    assert.deepEqual(
      (listedTools.result?.tools as Array<{ name: string }>).map(
        ({ name }) => name,
      ),
      ['smoke_primary', 'smoke_secondary'],
    )
    const mcpExecution = await requestMcp(mcpRoute, mcp.id, mcpKey.apiKey, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'smoke_secondary',
        arguments: { value: 'mcp' },
      },
    })
    assert.deepEqual(mcpExecution.result?.content, [
      { type: 'text', text: '"hello mcp"' },
    ])
    const conflict = await requestJson<ErrorResponse>(
      `/functions/${secondFunction.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'smoke_primary',
          code: `({ value }) => 'hello ' + value`,
          parameters: [{ name: 'value', type: 'string', required: true }],
        }),
      },
      409,
    )
    assert.equal(conflict.code, 'FUNCTION_NAME_CONFLICT')
    const firstKey = await createApiKey([firstFunction.id], 'first')
    const individuallyScopedTools = await requestMcp(
      mcpRoute,
      mcp.id,
      firstKey.apiKey,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      },
    )
    assert.deepEqual(
      (individuallyScopedTools.result?.tools as Array<{ name: string }>).map(
        ({ name }) => name,
      ),
      ['smoke_primary'],
    )

    const listed = await requestJson<FunctionsResponse>(
      '/functions',
      { method: 'GET' },
      200,
    )
    assert.deepEqual(
      listed.functions.map(({ id }) => id).sort((left, right) => left - right),
      [firstFunction.id, secondFunction.id].sort((left, right) => left - right),
    )
    const initialDetails = await requestJson<FunctionDetailsResponse>(
      `/functions/${firstFunction.id}`,
      { method: 'GET' },
      200,
    )
    assert.deepEqual(
      initialDetails.revisions.map(({ revision }) => revision),
      [1],
    )
    const initialKeys = await requestJson<ApiKeysResponse>(
      '/api-keys',
      { method: 'GET' },
      200,
    )
    assert.equal(initialKeys.apiKeys.length, 2)
    assert.equal('apiKey' in initialKeys.apiKeys[0]!, false)

    const firstExecution = await requestJson<ExecutionResponse>(
      `/functions/${firstFunction.id}/execute`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${firstKey.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arguments: { value: 'runner' } }),
      },
      200,
    )
    assert.equal(firstExecution.execution.status, 'succeeded')
    assert.equal(firstExecution.execution.result, 'hello runner')

    const crossFunctionResponse = await route.request(
      `/functions/${secondFunction.id}/execute`,
      {
        method: 'POST',
        headers: {
          'x-api-key': firstKey.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arguments: { value: 'runner' } }),
      },
    )
    assert.equal(crossFunctionResponse.status, 401)

    const updated = await requestJson<FunctionResponse>(
      `/functions/${firstFunction.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: `({ value }) => value.toUpperCase()`,
          parameters: [{ name: 'value', type: 'string', required: true }],
        }),
      },
      200,
    )
    assert.equal(updated.function.currentRevision, 2)

    const revisedExecution = await requestJson<ExecutionResponse>(
      `/functions/${firstFunction.id}/execute`,
      {
        method: 'POST',
        headers: {
          'x-api-key': firstKey.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arguments: { value: 'runner' } }),
      },
      200,
    )
    assert.equal(revisedExecution.execution.revision, 2)
    assert.equal(revisedExecution.execution.result, 'RUNNER')

    const restored = await requestJson<FunctionResponse>(
      `/functions/${firstFunction.id}/revisions/1/restore`,
      { method: 'POST' },
      201,
    )
    assert.equal(restored.function.currentRevision, 3)
    const restoredExecution = await requestJson<ExecutionResponse>(
      `/functions/${firstFunction.id}/execute`,
      {
        method: 'POST',
        headers: {
          'x-api-key': firstKey.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arguments: { value: 'again' } }),
      },
      200,
    )
    assert.equal(restoredExecution.execution.revision, 3)
    assert.equal(restoredExecution.execution.result, 'hello again')

    await db
      .update(runnerFunctionApiKeys)
      .set({
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(runnerFunctionApiKeys.id, firstKey.id))
    const expiredResponse = await route.request(
      `/functions/${firstFunction.id}/execute`,
      {
        method: 'POST',
        headers: {
          'x-api-key': firstKey.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arguments: { value: 'runner' } }),
      },
    )
    assert.equal(expiredResponse.status, 401)

    const archiveKey = await createApiKey([firstFunction.id], 'archive-check')
    const archived = await requestJson<FunctionResponse>(
      `/functions/${firstFunction.id}/archive`,
      { method: 'POST' },
      200,
    )
    assert.match(
      archived.function.name,
      /^smoke_primary#Archived\d{4}-\d{2}-\d{2}T/,
    )
    const replacement = await createFunction('smoke_primary')
    assert.notEqual(replacement.id, firstFunction.id)
    const archivedResponse = await route.request(
      `/functions/${firstFunction.id}/execute`,
      {
        method: 'POST',
        headers: {
          'x-api-key': archiveKey.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ arguments: { value: 'runner' } }),
      },
    )
    assert.equal(archivedResponse.status, 409)

    const logs = await db
      .select({
        apiKeyId: runnerExecutionLogs.apiKeyId,
        status: runnerExecutionLogs.status,
      })
      .from(runnerExecutionLogs)
      .where(
        and(
          eq(runnerExecutionLogs.organizationId, organizationId),
          eq(runnerExecutionLogs.functionId, firstFunction.id),
        ),
      )
    assert.deepEqual(
      logs.map(({ status }) => status),
      ['succeeded', 'succeeded', 'succeeded'],
    )
    assert.ok(logs.every(({ apiKeyId }) => apiKeyId === firstKey.id))

    console.log(
      JSON.stringify({
        status: 'ok',
        functionId: firstFunction.id,
        revisionsExecuted: [1, 2, 3],
        executionLogs: logs.length,
        functionAllowListRejected: true,
        expiredKeyRejected: true,
        archivedFunctionRejected: true,
        mcpToolExecuted: true,
      }),
    )
  } finally {
    await db
      .delete(runnerExecutionLogs)
      .where(eq(runnerExecutionLogs.organizationId, organizationId))
    await db
      .delete(runnerFunctionApiKeys)
      .where(eq(runnerFunctionApiKeys.organizationId, organizationId))
    await db
      .delete(runnerMcps)
      .where(eq(runnerMcps.organizationId, organizationId))
    await db
      .delete(runnerFunctions)
      .where(eq(runnerFunctions.organizationId, organizationId))
    await db.delete(organization).where(eq(organization.id, organizationId))
    await eventBus.close()
    await closeDatabase()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

async function createFunction(name: string) {
  const body = await requestJson<FunctionResponse>(
    '/functions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        code: `({ value }) => 'hello ' + value`,
        parameters: [{ name: 'value', type: 'string', required: true }],
      }),
    },
    201,
  )
  return body.function
}

async function createMcp(functionIds: number[]) {
  const body = await requestJson<McpResponse>(
    '/mcps',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'smoke_tools',
        description: 'Runner smoke-test tools',
        functionIds,
      }),
    },
    201,
  )
  return body.mcp
}

async function createApiKey(
  allowedFunctionIds: number[],
  name: string,
  allowedMcpIds: number[] = [],
) {
  const body = await requestJson<ApiKeyResponse>(
    '/api-keys',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        allowedFunctionIds,
        allowedMcpIds,
      }),
    },
    201,
  )
  return body.apiKey
}

async function requestMcp(
  mcpRoute: ReturnType<typeof createMcpRoute>,
  mcpId: number,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ result?: Record<string, unknown> }> {
  const response = await mcpRoute.request(`/${mcpId}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      host: 'localhost',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
  const text = await response.text()
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return JSON.parse(text) as { result?: Record<string, unknown> }
  }
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .at(-1)
  assert.ok(data)
  return JSON.parse(data) as { result?: Record<string, unknown> }
}

async function requestJson<Result>(
  path: string,
  init: RequestInit,
  expectedStatus: number,
): Promise<Result> {
  const response = await route.request(path, init)
  const responseBody = await response.text()
  let body: unknown
  try {
    body = JSON.parse(responseBody)
  } catch (error) {
    throw new Error(`Invalid JSON response for ${path} (${response.status})`, {
      cause: error,
    })
  }
  assert.equal(response.status, expectedStatus, JSON.stringify(body))
  return body as Result
}

interface FunctionResponse {
  function: { id: number; name: string; currentRevision: number }
}

interface FunctionsResponse {
  functions: Array<{ id: number }>
}

interface FunctionDetailsResponse {
  revisions: Array<{ revision: number }>
}

interface ApiKeysResponse {
  apiKeys: Array<{ id: number; keyPrefix: string }>
}

interface ApiKeyResponse {
  apiKey: { id: number; apiKey: string }
}

interface McpResponse {
  mcp: { id: number }
}

interface ExecutionResponse {
  execution: { status: string; revision: number; result: unknown }
}

interface ErrorResponse {
  code: string
  message: string
}
