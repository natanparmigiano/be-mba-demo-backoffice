import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Runner,
  RunnerApiKeyInvalidError,
  RunnerApiKeyScopeError,
  RunnerFunctionNameConflictError,
  RunnerMcpAccessForbiddenError,
  RunnerMcpNotFoundError,
  RunnerParameterValidationError,
  hashApiKey,
} from './runner.js'
import {
  createRunnerApiKeySchema,
  createRunnerFunctionSchema,
  createRunnerMcpSchema,
} from './schemas.js'
import type {
  RunnerExecutionResultState,
  RunnerExecutionRevision,
  RunnerRepository,
} from './types.js'

const apiKey = `rnr_${'a'.repeat(43)}`
const execution: RunnerExecutionRevision = {
  functionId: 7,
  organizationId: 'org-one',
  functionStatus: 'active',
  apiKeyId: 3,
  revision: {
    id: 11,
    revision: 2,
    code: `({ count }) => count + 1`,
    parameters: [{ name: 'count', type: 'integer', required: true }],
    createdAt: new Date(),
  },
}

describe('Runner function names', () => {
  it('requires snake_case function and MCP names', () => {
    assert.equal(
      createRunnerFunctionSchema.parse({
        name: 'customer_lookup',
        code: `() => true`,
      }).name,
      'customer_lookup',
    )
    assert.equal(
      createRunnerMcpSchema.parse({
        name: 'customer_tools',
        functionIds: [7],
      }).name,
      'customer_tools',
    )
    assert.throws(() =>
      createRunnerFunctionSchema.parse({
        name: 'Customer Lookup',
        code: `() => true`,
      }),
    )
    assert.throws(() =>
      createRunnerMcpSchema.parse({
        name: 'customer-tools',
        functionIds: [7],
      }),
    )
  })

  it('maps a nested PostgreSQL unique violation to a name conflict', async () => {
    const databaseError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'functions_organization_id_name_uidx',
    })
    const runner = new Runner({
      repository: createRepository({
        updateFunction: async () => {
          throw new Error('Failed query', { cause: databaseError })
        },
      }),
    })

    await assert.rejects(
      runner.updateFunction('org-one', 7, {
        name: 'already_used',
        code: `() => true`,
        parameters: [],
      }),
      RunnerFunctionNameConflictError,
    )
  })
})

describe('Runner API keys', () => {
  it('requires every key to have a future expiration', () => {
    assert.throws(() =>
      createRunnerApiKeySchema.parse({
        name: 'expired',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }),
    )
  })

  it('uses the requested function ID and a hash, never the raw key', async () => {
    let receivedFunctionId: number | undefined
    let receivedHash: string | undefined
    const repository = createRepository({
      getExecutionRevisionByApiKey: async (functionId, keyHash) => {
        receivedFunctionId = functionId
        receivedHash = keyHash
        return execution
      },
    })
    const runner = new Runner({
      repository,
      executor: {
        execute: async () => ({ status: 'succeeded', result: 3 }),
      },
    })

    const result = await runner.executeFunction(7, apiKey, {
      arguments: { count: 2 },
    })

    assert.equal(result.status, 'succeeded')
    assert.equal(receivedFunctionId, 7)
    assert.equal(receivedHash, hashApiKey(apiKey))
    assert.notEqual(receivedHash, apiKey)
  })

  it('publishes a queued execution and returns the worker result through the same API', async () => {
    const startedAt = new Date()
    let publishedExecutionId: number | undefined
    let claimed = false
    let state: RunnerExecutionResultState = { status: 'pending' }
    const repository = createRepository({
      getExecutionRevisionByApiKey: async () => execution,
      createExecutionLog: async () => ({ id: 17, startedAt }),
      claimExecution: async (executionId) => {
        if (executionId !== 17 || claimed) return undefined
        claimed = true
        return {
          executionId,
          functionId: execution.functionId,
          revision: execution.revision.revision,
          code: execution.revision.code,
          parameters: { count: 2 },
          startedAt,
        }
      },
      getExecutionResult: async () => state,
      finishExecutionLog: async (executionId, outcome) => {
        state = {
          status: 'finished',
          execution:
            outcome.status === 'succeeded'
              ? {
                  executionId,
                  functionId: execution.functionId,
                  revision: execution.revision.revision,
                  status: 'succeeded',
                  result: outcome.result,
                  durationMs: outcome.durationMs,
                  startedAt,
                  finishedAt: outcome.finishedAt,
                }
              : {
                  executionId,
                  functionId: execution.functionId,
                  revision: execution.revision.revision,
                  status: outcome.status,
                  errorMessage: outcome.errorMessage ?? 'failed',
                  durationMs: outcome.durationMs,
                  startedAt,
                  finishedAt: outcome.finishedAt,
                },
        }
      },
    })
    const queuedRunner = new Runner({
      repository,
      executor: {
        execute: async () => ({ status: 'succeeded', result: 3 }),
      },
      executionPublisher: async (executionId) => {
        publishedExecutionId = executionId
        await queuedRunner.executeQueuedExecution(executionId)
      },
    })

    const result = await queuedRunner.executeFunction(7, apiKey, {
      arguments: { count: 2 },
    })

    assert.equal(publishedExecutionId, 17)
    assert.equal(result.status, 'succeeded')
    assert.equal(result.result, 3)
    assert.equal(await queuedRunner.executeQueuedExecution(17), false)
  })

  it('rejects malformed keys before accessing the repository', async () => {
    let repositoryCalled = false
    const runner = new Runner({
      repository: createRepository({
        getExecutionRevisionByApiKey: async () => {
          repositoryCalled = true
          return execution
        },
      }),
    })

    await assert.rejects(
      runner.executeFunction(7, 'not-a-runner-key', {
        arguments: { count: 2 },
      }),
      RunnerApiKeyInvalidError,
    )
    assert.equal(repositoryCalled, false)
  })

  it('validates the selected revision parameter contract before logging', async () => {
    let logCreated = false
    const runner = new Runner({
      repository: createRepository({
        getExecutionRevisionByApiKey: async () => execution,
        createExecutionLog: async () => {
          logCreated = true
          return { id: 1, startedAt: new Date() }
        },
      }),
    })

    await assert.rejects(
      runner.executeFunction(7, apiKey, {
        arguments: { count: 'two' },
      }),
      RunnerParameterValidationError,
    )
    assert.equal(logCreated, false)
  })

  it('rejects allowed function IDs outside the organization', async () => {
    const runner = new Runner({
      repository: createRepository({
        createApiKey: async () => ({
          status: 'invalid_scope_ids',
          functionIds: [9],
          mcpIds: [],
        }),
      }),
    })

    await assert.rejects(
      runner.createApiKey('org-one', {
        name: 'limited',
        expiresAt: new Date(Date.now() + 60_000),
        allowedFunctionIds: [7, 9],
        allowedMcpIds: [],
      }),
      RunnerApiKeyScopeError,
    )
  })

  it('rejects allowed MCP IDs outside the organization', async () => {
    const runner = new Runner({
      repository: createRepository({
        createApiKey: async () => ({
          status: 'invalid_scope_ids',
          functionIds: [],
          mcpIds: [12],
        }),
      }),
    })

    await assert.rejects(
      runner.createApiKey('org-one', {
        name: 'limited-to-pack',
        expiresAt: new Date(Date.now() + 60_000),
        allowedFunctionIds: [],
        allowedMcpIds: [12],
      }),
      (error: unknown) =>
        error instanceof RunnerApiKeyScopeError &&
        error.mcpIds.length === 1 &&
        error.mcpIds[0] === 12,
    )
  })

  it('upserts and uses the organization UI key for browser execution', async () => {
    let upsertedOrganizationId: string | undefined
    let upsertedHash: string | undefined
    let executionApiKeyId: number | undefined
    const repository = createRepository({
      upsertUiApiKey: async (organizationId, input) => {
        upsertedOrganizationId = organizationId
        upsertedHash = input.keyHash
        return {
          id: 3,
          organizationId,
          allowedFunctionIds: null,
          allowedMcpIds: null,
          name: 'UI',
          keyPrefix: input.keyPrefix,
          expiresAt: input.expiresAt,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        }
      },
      getExecutionRevisionForOrganization: async (
        _organizationId,
        _functionId,
        apiKeyId,
      ) => {
        executionApiKeyId = apiKeyId
        return execution
      },
    })
    const runner = new Runner({
      repository,
      executor: {
        execute: async () => ({ status: 'succeeded', result: 3 }),
      },
    })

    const result = await runner.executeFunctionForOrganization('org-one', 7, {
      arguments: { count: 2 },
    })

    assert.equal(result.status, 'succeeded')
    assert.equal(upsertedOrganizationId, 'org-one')
    assert.match(upsertedHash ?? '', /^[a-f0-9]{64}$/)
    assert.equal(executionApiKeyId, 3)
  })

  it('resolves an MCP runtime with the key hash and maps access failures', async () => {
    let receivedHash: string | undefined
    const runtime = {
      id: 4,
      organizationId: 'org-one',
      name: 'customer_tools',
      description: null,
      functions: [
        {
          id: 7,
          name: 'lookup_customer',
          description: null,
          currentRevision: 2,
          parameters: [
            { name: 'count', type: 'integer' as const, required: true },
          ],
        },
      ],
    }
    const runner = new Runner({
      repository: createRepository({
        getMcpRuntimeByApiKey: async (_mcpId, keyHash) => {
          receivedHash = keyHash
          return { status: 'found', mcp: runtime }
        },
      }),
    })

    assert.deepEqual(await runner.getMcpRuntime(4, apiKey), runtime)
    assert.equal(receivedHash, hashApiKey(apiKey))

    const forbiddenRunner = new Runner({
      repository: createRepository({
        getMcpRuntimeByApiKey: async () => ({ status: 'forbidden' }),
      }),
    })
    await assert.rejects(
      forbiddenRunner.getMcpRuntime(4, apiKey),
      RunnerMcpAccessForbiddenError,
    )

    const missingRunner = new Runner({
      repository: createRepository({
        getMcpRuntimeByApiKey: async () => ({ status: 'not_found' }),
      }),
    })
    await assert.rejects(
      missingRunner.getMcpRuntime(4, apiKey),
      RunnerMcpNotFoundError,
    )
  })

  it('rechecks MCP membership and API-key scope for every tool execution', async () => {
    let receivedMcpId: number | undefined
    let receivedFunctionId: number | undefined
    let receivedHash: string | undefined
    const runner = new Runner({
      repository: createRepository({
        getMcpExecutionRevisionByApiKey: async (mcpId, functionId, keyHash) => {
          receivedMcpId = mcpId
          receivedFunctionId = functionId
          receivedHash = keyHash
          return execution
        },
      }),
      executor: {
        execute: async () => ({ status: 'succeeded', result: 3 }),
      },
    })

    const result = await runner.executeMcpFunction(4, 7, apiKey, { count: 2 })

    assert.equal(result.status, 'succeeded')
    assert.equal(receivedMcpId, 4)
    assert.equal(receivedFunctionId, 7)
    assert.equal(receivedHash, hashApiKey(apiKey))
  })
})

function createRepository(
  overrides: Partial<RunnerRepository> = {},
): RunnerRepository {
  return {
    listFunctions: async () => [],
    getFunction: async () => ({ status: 'not_found' }),
    createFunction: async () => {
      throw new Error('Unexpected createFunction call')
    },
    updateFunction: async () => ({ status: 'not_found' }),
    archiveFunction: async () => ({ status: 'not_found' }),
    restoreRevision: async () => ({ status: 'not_found' }),
    listMcps: async () => ({ status: 'found', mcps: [] }),
    getMcp: async () => ({ status: 'not_found' }),
    createMcp: async () => ({
      status: 'invalid_function_ids',
      functionIds: [],
    }),
    updateMcp: async () => ({ status: 'not_found' }),
    deleteMcp: async () => false,
    listExecutions: async () => ({ status: 'not_found' }),
    listApiKeys: async () => ({ status: 'found', apiKeys: [] }),
    createApiKey: async () => ({
      status: 'invalid_scope_ids',
      functionIds: [],
      mcpIds: [],
    }),
    upsertUiApiKey: async () => ({
      id: 3,
      organizationId: 'org-one',
      allowedFunctionIds: null,
      allowedMcpIds: null,
      name: 'UI',
      keyPrefix: 'rnr_example1',
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    }),
    revokeApiKey: async () => false,
    getMcpRuntimeByApiKey: async () => ({ status: 'invalid_key' }),
    getExecutionRevisionByApiKey: async () => undefined,
    getMcpExecutionRevisionByApiKey: async () => undefined,
    getExecutionRevisionForOrganization: async () => undefined,
    createExecutionLog: async () => ({ id: 17, startedAt: new Date() }),
    claimExecution: async () => undefined,
    getExecutionResult: async () => ({ status: 'not_found' }),
    finishExecutionLog: async () => undefined,
    ...overrides,
  }
}
