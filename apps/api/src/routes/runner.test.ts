import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RunnerFunctionExecutionInProgressError,
  RunnerFunctionNameConflictError,
} from '@mba-demo/runner'
import type {
  CreatedRunnerApiKey,
  RunnerExecutionResult,
  RunnerFunctionDefinition,
  RunnerMcpImportPreview,
  RunnerMcpPackage,
} from '@mba-demo/runner'
import { createRunnerRoute, type RunnerManagementApi } from './runner.js'
import {
  parseRunnerMcpPackageYaml,
  stringifyRunnerMcpPackageYaml,
} from '../runner-mcp-package.js'

const now = new Date('2026-09-30T12:00:00.000Z')
const definition: RunnerFunctionDefinition = {
  id: 7,
  organizationId: 'org-one',
  name: 'greet',
  description: null,
  status: 'active',
  currentRevision: 1,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
  revision: {
    id: 11,
    revision: 1,
    code: `({ name }) => 'Hello ' + name`,
    parameters: [{ name: 'name', type: 'string', required: true }],
    createdAt: now,
  },
}
const mcp = {
  id: 3,
  organizationId: 'org-one',
  name: 'customer_tools',
  description: 'Customer-facing tools',
  functionCount: 1,
  functionNames: ['greet'],
  createdAt: now,
  updatedAt: now,
  functions: [
    {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      currentRevision: definition.currentRevision,
    },
  ],
}
const mcpPackage: RunnerMcpPackage = {
  format: 'mba-mcp',
  version: 1,
  mcp: {
    name: mcp.name,
    description: mcp.description,
    functions: [
      {
        name: definition.name,
        description: definition.description,
        currentRevision: 1,
        revisions: [
          {
            revision: 1,
            code: definition.revision.code,
            parameters: definition.revision.parameters,
            createdAt: now.toISOString(),
          },
        ],
      },
    ],
  },
}
const mcpImportPreview: RunnerMcpImportPreview = {
  mode: 'create',
  existingMcpId: null,
  mcpName: mcp.name,
  description: mcp.description,
  functions: [
    {
      sourceName: definition.name,
      targetName: `${mcp.name}__${definition.name}`,
      currentRevision: 1,
      revisionCount: 1,
    },
  ],
  removedFunctionNames: [],
  affectedApiKeyCount: 0,
  affectedExecutionCount: 0,
  blockers: [],
  canImport: true,
}

describe('runner route', () => {
  it('lists functions for the active organization with session auth', async () => {
    let organizationId: string | undefined
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      runner: createRunner({
        listFunctions: async (receivedOrganizationId) => {
          organizationId = receivedOrganizationId
          return [definition]
        },
      }),
    })

    const response = await route.request('/functions')
    const body = (await response.json()) as { functions: Array<{ id: number }> }

    assert.equal(response.status, 200)
    assert.equal(organizationId, 'org-one')
    assert.deepEqual(
      body.functions.map(({ id }) => id),
      [7],
    )
  })

  it('restores an older revision as a new revision for an owner', async () => {
    let requestedRevision: number | undefined
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      runner: createRunner({
        restoreRevision: async (_organizationId, _functionId, revision) => {
          requestedRevision = revision
          return { ...definition, currentRevision: 3 }
        },
      }),
    })

    const response = await route.request('/functions/7/revisions/1/restore', {
      method: 'POST',
    })

    assert.equal(response.status, 201)
    assert.equal(requestedRevision, 1)
  })

  it('lists execution history in the active organization', async () => {
    let receivedOrganizationId: string | undefined
    let receivedFunctionId: number | undefined
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      runner: createRunner({
        listExecutions: async (organizationId, functionId) => {
          receivedOrganizationId = organizationId
          receivedFunctionId = functionId
          return [
            {
              id: 9,
              functionId,
              revision: 1,
              apiKeyName: 'UI',
              status: 'succeeded',
              arguments: { name: 'Ada' },
              result: 'Hello Ada',
              errorMessage: null,
              durationMs: 2,
              startedAt: now,
              finishedAt: now,
            },
          ]
        },
      }),
    })

    const response = await route.request('/functions/7/executions')
    const body = (await response.json()) as {
      executions: Array<{ id: number; startedAt: string }>
    }

    assert.equal(response.status, 200)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.equal(receivedFunctionId, 7)
    assert.deepEqual(body.executions, [
      {
        id: 9,
        functionId: 7,
        revision: 1,
        apiKeyName: 'UI',
        status: 'succeeded',
        arguments: { name: 'Ada' },
        result: 'Hello Ada',
        errorMessage: null,
        durationMs: 2,
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
      },
    ])
  })

  it('creates a function in the active organization for an admin', async () => {
    let organizationId: string | undefined
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      runner: createRunner({
        createFunction: async (receivedOrganizationId) => {
          organizationId = receivedOrganizationId
          return definition
        },
      }),
    })
    const response = await route.request('/functions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'greet',
        code: definition.revision.code,
        parameters: definition.revision.parameters,
      }),
    })

    assert.equal(response.status, 201)
    assert.equal(organizationId, 'org-one')
  })

  it('returns a friendly conflict when a function name is already used', async () => {
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      runner: createRunner({
        updateFunction: async () => {
          throw new RunnerFunctionNameConflictError()
        },
      }),
    })
    const response = await route.request('/functions/7', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'already_used',
        code: definition.revision.code,
        parameters: definition.revision.parameters,
      }),
    })

    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      code: 'FUNCTION_NAME_CONFLICT',
      message: 'A runner function already uses this name in the organization',
    })
  })

  it('deletes an organization function for managers and rejects active executions', async () => {
    const calls: string[] = []
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      runner: createRunner({
        deleteFunction: async (organizationId, functionId) => {
          calls.push(`${organizationId}:${functionId}`)
        },
      }),
    })
    const response = await route.request('/functions/7', { method: 'DELETE' })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { deleted: true, functionId: 7 })
    assert.deepEqual(calls, ['org-one:7'])

    const memberRoute = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'member' }),
      runner: createRunner({
        deleteFunction: async () => {
          throw new Error('must not delete')
        },
      }),
    })
    assert.equal(
      (await memberRoute.request('/functions/7', { method: 'DELETE' })).status,
      403,
    )

    const busyRoute = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      runner: createRunner({
        deleteFunction: async () => {
          throw new RunnerFunctionExecutionInProgressError()
        },
      }),
    })
    const busyResponse = await busyRoute.request('/functions/7', {
      method: 'DELETE',
    })
    assert.equal(busyResponse.status, 409)
    assert.deepEqual(await busyResponse.json(), {
      code: 'FUNCTION_EXECUTION_IN_PROGRESS',
      message:
        'Wait for queued or running executions before deleting this function',
    })
  })

  it('manages organization-scoped MCP packs without exposing an execution route', async () => {
    const calls: string[] = []
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      runner: createRunner({
        listMcps: async (organizationId) => {
          calls.push(`list:${organizationId}`)
          return [mcp]
        },
        getMcp: async (organizationId, mcpId) => {
          calls.push(`get:${organizationId}:${mcpId}`)
          return mcp
        },
        createMcp: async (organizationId, input) => {
          calls.push(`create:${organizationId}:${input.functionIds.join(',')}`)
          return mcp
        },
        updateMcp: async (organizationId, mcpId, input) => {
          calls.push(`update:${organizationId}:${mcpId}:${input.name}`)
          return { ...mcp, name: input.name }
        },
        deleteMcp: async (organizationId, mcpId) => {
          calls.push(`delete:${organizationId}:${mcpId}`)
        },
      }),
    })
    const input = {
      name: 'customer_tools',
      description: 'Customer-facing tools',
      functionIds: [7],
    }

    const listResponse = await route.request('/mcps')
    const detailResponse = await route.request('/mcps/3')
    const createResponse = await route.request('/mcps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    const updateResponse = await route.request('/mcps/3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, name: 'customer_operations' }),
    })
    const deleteResponse = await route.request('/mcps/3', {
      method: 'DELETE',
    })
    const missingExecutionResponse = await route.request('/mcps/3/execute', {
      method: 'POST',
    })

    assert.equal(listResponse.status, 200)
    assert.equal(detailResponse.status, 200)
    assert.equal(createResponse.status, 201)
    assert.equal(updateResponse.status, 200)
    assert.equal(deleteResponse.status, 200)
    assert.equal(missingExecutionResponse.status, 404)
    assert.deepEqual(calls, [
      'list:org-one',
      'get:org-one:3',
      'create:org-one:7',
      'update:org-one:3:customer_operations',
      'delete:org-one:3',
    ])
  })

  it('exports, inspects, and transactionally imports complete MCP packages', async () => {
    const calls: string[] = []
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      runner: createRunner({
        exportMcpPackage: async (organizationId, mcpId) => {
          calls.push(`export:${organizationId}:${mcpId}`)
          return mcpPackage
        },
        inspectMcpImport: async (organizationId, imported) => {
          calls.push(`inspect:${organizationId}:${imported.mcp.name}`)
          return mcpImportPreview
        },
        importMcpPackage: async (organizationId, imported, overwrite) => {
          calls.push(
            `import:${organizationId}:${imported.mcp.name}:${overwrite}`,
          )
          return { status: 'imported', mcp }
        },
      }),
    })
    const yaml = stringifyRunnerMcpPackageYaml(mcpPackage)

    const exported = await route.request('/mcps/3/export')
    assert.equal(exported.status, 200)
    assert.match(
      exported.headers.get('content-type') ?? '',
      /^application\/yaml/,
    )
    assert.equal(
      exported.headers.get('content-disposition'),
      'attachment; filename="customer_tools.mcpx"',
    )
    assert.deepEqual(
      parseRunnerMcpPackageYaml(await exported.text()),
      mcpPackage,
    )

    const inspected = await route.request('/mcps/import/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml }),
    })
    assert.equal(inspected.status, 200)
    assert.deepEqual(await inspected.json(), { preview: mcpImportPreview })

    const imported = await route.request('/mcps/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml, overwrite: true }),
    })
    assert.equal(imported.status, 200)
    assert.deepEqual(calls, [
      'export:org-one:3',
      'inspect:org-one:customer_tools',
      'import:org-one:customer_tools:true',
    ])
  })

  it('returns a newly created organization-scoped API key once', async () => {
    let receivedOrganizationId: string | undefined
    let receivedAllowedFunctionIds: number[] | null | undefined
    let receivedAllowedMcpIds: number[] | null | undefined
    const apiKey: CreatedRunnerApiKey = {
      id: 5,
      organizationId: 'org-one',
      allowedFunctionIds: [7],
      allowedMcpIds: [],
      name: 'integration',
      keyPrefix: 'rnr_example1',
      apiKey: 'rnr_example-key-secret',
      expiresAt: new Date('2099-10-01T12:00:00.000Z'),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
    }
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'owner' }),
      runner: createRunner({
        createApiKey: async (organizationId, input) => {
          receivedOrganizationId = organizationId
          receivedAllowedFunctionIds = input.allowedFunctionIds
          receivedAllowedMcpIds = input.allowedMcpIds
          return apiKey
        },
      }),
    })
    const response = await route.request('/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'integration',
        expiresAt: '2099-10-01T12:00:00.000Z',
        allowedFunctionIds: [7],
        allowedMcpIds: [3],
      }),
    })

    assert.equal(response.status, 201)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.deepEqual(receivedAllowedFunctionIds, [7])
    assert.deepEqual(receivedAllowedMcpIds, [3])
    assert.equal(
      ((await response.json()) as { apiKey: { apiKey: string } }).apiKey.apiKey,
      apiKey.apiKey,
    )
  })

  it('executes from the UI with the active organization', async () => {
    let receivedOrganizationId: string | undefined
    let receivedFunctionId: number | undefined
    const execution: RunnerExecutionResult = {
      executionId: 10,
      functionId: 7,
      revision: 1,
      status: 'succeeded',
      result: 'Hello Ada',
      durationMs: 2,
      startedAt: now,
      finishedAt: now,
    }
    const route = createRunnerRoute({
      getAccess: async () => ({ organizationId: 'org-one', role: 'admin' }),
      runner: createRunner({
        executeFunctionForOrganization: async (organizationId, functionId) => {
          receivedOrganizationId = organizationId
          receivedFunctionId = functionId
          return execution
        },
      }),
    })

    const response = await route.request('/functions/7/execute-ui', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arguments: { name: 'Ada' } }),
    })

    assert.equal(response.status, 200)
    assert.equal(receivedOrganizationId, 'org-one')
    assert.equal(receivedFunctionId, 7)
  })

  it('requires and forwards an organization API key for execution', async () => {
    let receivedKey: string | undefined
    let receivedFunctionId: number | undefined
    const execution: RunnerExecutionResult = {
      executionId: 9,
      functionId: 7,
      revision: 1,
      status: 'succeeded',
      result: 'Hello Ada',
      durationMs: 2,
      startedAt: now,
      finishedAt: now,
    }
    const route = createRunnerRoute({
      getAccess: async () => {
        throw new Error('Execution must not depend on a browser session')
      },
      runner: createRunner({
        executeFunction: async (functionId, apiKey) => {
          receivedFunctionId = functionId
          receivedKey = apiKey
          return execution
        },
      }),
    })

    const unauthorized = await route.request('/functions/7/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arguments: { name: 'Ada' } }),
    })
    const response = await route.request('/functions/7/execute', {
      method: 'POST',
      headers: {
        authorization: 'Bearer rnr_organization-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ arguments: { name: 'Ada' } }),
    })

    assert.equal(unauthorized.status, 401)
    assert.equal(response.status, 200)
    assert.equal(receivedFunctionId, 7)
    assert.equal(receivedKey, 'rnr_organization-secret')
  })
})

function createRunner(
  overrides: Partial<RunnerManagementApi> = {},
): RunnerManagementApi {
  return {
    listFunctions: async () => [],
    getFunction: async () => ({
      definition,
      revisions: [definition.revision],
    }),
    createFunction: async () => definition,
    updateFunction: async () => definition,
    archiveFunction: async () => ({
      ...definition,
      status: 'archived',
      archivedAt: now,
    }),
    deleteFunction: async () => undefined,
    restoreRevision: async () => definition,
    listMcps: async () => [],
    getMcp: async () => {
      throw new Error('Unexpected getMcp call')
    },
    createMcp: async () => {
      throw new Error('Unexpected createMcp call')
    },
    updateMcp: async () => {
      throw new Error('Unexpected updateMcp call')
    },
    deleteMcp: async () => undefined,
    exportMcpPackage: async () => mcpPackage,
    inspectMcpImport: async () => mcpImportPreview,
    importMcpPackage: async () => ({ status: 'imported', mcp }),
    listExecutions: async () => [],
    listApiKeys: async () => [],
    createApiKey: async () => {
      throw new Error('Unexpected createApiKey call')
    },
    revokeApiKey: async () => undefined,
    executeFunctionForOrganization: async () => {
      throw new Error('Unexpected executeFunctionForOrganization call')
    },
    executeFunction: async () => {
      throw new Error('Unexpected executeFunction call')
    },
    ...overrides,
  }
}
