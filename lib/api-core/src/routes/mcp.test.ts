import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  RunnerApiKeyInvalidError,
  RunnerMcpAccessForbiddenError,
  type RunnerExecutionResult,
  type RunnerMcpRuntimeDefinition,
} from '@mba-desk/runner'
import { parseRunnerMcpPackageYaml } from '../runner-mcp-package.js'
import { createMcpRoute, type McpRunnerApi } from './mcp.js'

const token = `rnr_${'a'.repeat(43)}`
const now = new Date('2026-10-01T12:00:00.000Z')
const runtime: RunnerMcpRuntimeDefinition = {
  id: 4,
  organizationId: 'org-one',
  name: 'customer_tools',
  description: 'Customer operations',
  functions: [
    {
      id: 7,
      name: 'lookup_customer',
      description: 'Looks up one customer',
      currentRevision: 2,
      parameters: [
        {
          name: 'customer_id',
          type: 'string',
          required: true,
          description: 'Customer identifier',
        },
        { name: 'include_orders', type: 'boolean', required: false },
      ],
    },
  ],
}

describe('MCP route', () => {
  it('requires a bearer runner API key without restricting the request host', async () => {
    const route = createMcpRoute({ runner: createRunner() })

    const response = await route.request('/4', {
      method: 'POST',
      headers: { host: 'mcp.corp.example' },
    })

    assert.equal(response.status, 401)
    assert.equal(response.headers.get('www-authenticate'), 'Bearer')
  })

  it('maps invalid and insufficiently scoped keys before protocol handling', async () => {
    const invalidRoute = createMcpRoute({
      runner: createRunner({
        getMcpRuntime: async () => {
          throw new RunnerApiKeyInvalidError()
        },
      }),
    })
    const forbiddenRoute = createMcpRoute({
      runner: createRunner({
        getMcpRuntime: async () => {
          throw new RunnerMcpAccessForbiddenError()
        },
      }),
    })

    const invalid = await mcpRequest(invalidRoute, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })
    const forbidden = await mcpRequest(forbiddenRoute, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })

    assert.equal(invalid.status, 401)
    assert.equal(forbidden.status, 403)
  })

  it('advertises authorized functions and executes tool calls through the runner', async () => {
    let receivedMcpId: number | undefined
    let receivedFunctionId: number | undefined
    let receivedToken: string | undefined
    let receivedParameters: Record<string, unknown> | undefined
    const route = createMcpRoute({
      runner: createRunner({
        executeMcpFunction: async (mcpId, functionId, apiKey, parameters) => {
          receivedMcpId = mcpId
          receivedFunctionId = functionId
          receivedToken = apiKey
          receivedParameters = parameters
          return succeededExecution({ customer_id: parameters.customer_id })
        },
      }),
    })

    const listResponse = await mcpRequest(route, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })
    const listPayload = await readMcpPayload(listResponse)
    assert.equal(listResponse.status, 200)
    assert.deepEqual(listPayload.result?.tools, [
      {
        name: 'lookup_customer',
        description: 'Looks up one customer',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            customer_id: {
              type: 'string',
              description: 'Customer identifier',
            },
            include_orders: { type: 'boolean' },
          },
          required: ['customer_id'],
          additionalProperties: false,
        },
      },
    ])

    const callResponse = await mcpRequest(route, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'lookup_customer',
        arguments: { customer_id: 'cus_123' },
      },
    })
    const callPayload = await readMcpPayload(callResponse)
    assert.equal(callResponse.status, 200)
    assert.deepEqual(callPayload.result, {
      content: [{ type: 'text', text: '{"customer_id":"cus_123"}' }],
    })
    assert.equal(receivedMcpId, 4)
    assert.equal(receivedFunctionId, 7)
    assert.equal(receivedToken, token)
    assert.deepEqual(receivedParameters, { customer_id: 'cus_123' })
  })

  it('exposes every documented Dunder Mifflin tool parameter through MCP', async () => {
    const sample = parseRunnerMcpPackageYaml(
      await readFile(
        new URL(
          '../../../../docs/mcpx/sample_dunder_mifflin.mcpx',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const sampleRuntime: RunnerMcpRuntimeDefinition = {
      id: 4,
      organizationId: 'org-one',
      name: sample.mcp.name,
      description: sample.mcp.description,
      functions: sample.mcp.functions.map((fn, index) => ({
        id: index + 1,
        name: fn.name,
        description: fn.description,
        currentRevision: fn.currentRevision,
        parameters: fn.revisions.at(-1)!.parameters,
      })),
    }
    const route = createMcpRoute({
      runner: createRunner({ getMcpRuntime: async () => sampleRuntime }),
    })

    const payload = await readMcpPayload(
      await mcpRequest(route, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
      }),
    )
    const tools = payload.result?.tools as Array<{
      name: string
      inputSchema: {
        properties: Record<string, { type?: string; description?: string }>
        required?: string[]
        additionalProperties: boolean
      }
    }>

    assert.equal(tools.length, sample.mcp.functions.length)
    for (const fn of sample.mcp.functions) {
      const tool = tools.find(({ name }) => name === fn.name)
      assert.ok(tool, `missing MCP tool ${fn.name}`)
      const parameters = fn.revisions.at(-1)!.parameters
      assert.deepEqual(
        Object.keys(tool.inputSchema.properties),
        parameters.map(({ name }) => name),
      )
      assert.deepEqual(
        tool.inputSchema.required ?? [],
        parameters.filter(({ required }) => required).map(({ name }) => name),
      )
      assert.equal(tool.inputSchema.additionalProperties, false)
      for (const parameter of parameters) {
        assert.equal(
          tool.inputSchema.properties[parameter.name]?.description,
          parameter.description,
        )
      }
    }
  })

  it('returns failed runner executions as MCP tool errors', async () => {
    const route = createMcpRoute({
      runner: createRunner({
        executeMcpFunction: async () => ({
          executionId: 19,
          functionId: 7,
          revision: 2,
          status: 'timed_out',
          errorMessage: 'Execution exceeded 500 ms',
          durationMs: 500,
          startedAt: now,
          finishedAt: now,
        }),
      }),
    })

    const response = await mcpRequest(route, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'lookup_customer',
        arguments: { customer_id: 'cus_123' },
      },
    })

    assert.deepEqual((await readMcpPayload(response)).result, {
      content: [{ type: 'text', text: 'Execution exceeded 500 ms' }],
      isError: true,
    })
  })
})

function createRunner(overrides: Partial<McpRunnerApi> = {}): McpRunnerApi {
  return {
    getMcpRuntime: async () => runtime,
    executeMcpFunction: async () => succeededExecution(null),
    ...overrides,
  }
}

function succeededExecution(result: unknown): RunnerExecutionResult {
  return {
    executionId: 18,
    functionId: 7,
    revision: 2,
    status: 'succeeded',
    result,
    durationMs: 2,
    startedAt: now,
    finishedAt: now,
  }
}

function mcpRequest(
  route: ReturnType<typeof createMcpRoute>,
  body: Record<string, unknown>,
) {
  return route.request('/4', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      host: 'localhost',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify(body),
  })
}

async function readMcpPayload(response: Response): Promise<{
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}> {
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
