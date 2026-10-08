import { auth } from '@mba-desk/auth'
import { db, member } from '@mba-desk/db'
import {
  RunnerApiKeyInvalidError,
  RunnerApiKeyScopeError,
  RunnerFunctionArchivedError,
  RunnerFunctionExecutionInProgressError,
  RunnerExecutionDispatchTimeoutError,
  RunnerFunctionNameConflictError,
  RunnerFunctionNotFoundError,
  RunnerMcpNameConflictError,
  RunnerMcpInUseError,
  RunnerMcpNotFoundError,
  RUNNER_MCP_PACKAGE_MAX_BYTES,
  RunnerParameterValidationError,
  createRunnerApiKeySchema,
  createRunnerFunctionSchema,
  createRunnerMcpSchema,
  executeRunnerFunctionSchema,
  runner as defaultRunner,
  updateRunnerFunctionSchema,
  updateRunnerMcpSchema,
  type CreateRunnerApiKeyInput,
  type CreateRunnerFunctionInput,
  type CreateRunnerMcpInput,
  type CreatedRunnerApiKey,
  type ExecuteRunnerFunctionInput,
  type RunnerExecutionResult,
  type RunnerExecutionHistoryEntry,
  type RunnerFunctionDefinition,
  type RunnerFunctionDetails,
  type RunnerFunctionSummary,
  type RunnerMcpDefinition,
  type RunnerMcpImportPreview,
  type RunnerMcpImportResult,
  type RunnerMcpPackage,
  type RunnerMcpSummary,
  type RunnerApiKeyMetadata,
  type UpdateRunnerFunctionInput,
  type UpdateRunnerMcpInput,
} from '@mba-desk/runner'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  parseRunnerMcpPackageYaml,
  stringifyRunnerMcpPackageYaml,
} from '../runner-mcp-package.js'

const runnerApiKeyHeadersSchema = z.object({
  authorization: z.string().optional(),
  'x-api-key': z.string().optional(),
})

const runnerMcpImportInspectSchema = z.object({
  yaml: z.string().min(1).max(RUNNER_MCP_PACKAGE_MAX_BYTES),
})

const runnerMcpImportSchema = runnerMcpImportInspectSchema.extend({
  overwrite: z.boolean().default(false),
})

interface OrganizationAccess {
  organizationId: string
  role: string
}

export interface RunnerManagementApi {
  listFunctions(organizationId: string): Promise<RunnerFunctionSummary[]>
  getFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerFunctionDetails>
  createFunction(
    organizationId: string,
    input: CreateRunnerFunctionInput,
  ): Promise<RunnerFunctionDefinition>
  updateFunction(
    organizationId: string,
    functionId: number,
    input: UpdateRunnerFunctionInput,
  ): Promise<RunnerFunctionDefinition>
  archiveFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerFunctionDefinition>
  deleteFunction(organizationId: string, functionId: number): Promise<void>
  restoreRevision(
    organizationId: string,
    functionId: number,
    revision: number,
  ): Promise<RunnerFunctionDefinition>
  listMcps(organizationId: string): Promise<RunnerMcpSummary[]>
  getMcp(organizationId: string, mcpId: number): Promise<RunnerMcpDefinition>
  createMcp(
    organizationId: string,
    input: CreateRunnerMcpInput,
  ): Promise<RunnerMcpDefinition>
  updateMcp(
    organizationId: string,
    mcpId: number,
    input: UpdateRunnerMcpInput,
  ): Promise<RunnerMcpDefinition>
  deleteMcp(organizationId: string, mcpId: number): Promise<void>
  exportMcpPackage(
    organizationId: string,
    mcpId: number,
  ): Promise<RunnerMcpPackage>
  inspectMcpImport(
    organizationId: string,
    imported: RunnerMcpPackage,
  ): Promise<RunnerMcpImportPreview>
  importMcpPackage(
    organizationId: string,
    imported: RunnerMcpPackage,
    overwrite: boolean,
  ): Promise<RunnerMcpImportResult>
  listExecutions(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerExecutionHistoryEntry[]>
  listApiKeys(organizationId: string): Promise<RunnerApiKeyMetadata[]>
  createApiKey(
    organizationId: string,
    input: CreateRunnerApiKeyInput,
  ): Promise<CreatedRunnerApiKey>
  revokeApiKey(organizationId: string, apiKeyId: number): Promise<void>
  executeFunctionForOrganization(
    organizationId: string,
    functionId: number,
    input: ExecuteRunnerFunctionInput,
  ): Promise<RunnerExecutionResult>
  executeFunction(
    functionId: number,
    apiKey: string,
    input: ExecuteRunnerFunctionInput,
  ): Promise<RunnerExecutionResult>
}

export interface RunnerRouteOptions {
  getAccess?: (headers: Headers) => Promise<OrganizationAccess | undefined>
  runner?: RunnerManagementApi
}

export const createRunnerRoute = ({
  getAccess = getOrganizationAccess,
  runner = defaultRunner,
}: RunnerRouteOptions = {}) =>
  new Hono()
    .get('/functions', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const functions = await runner.listFunctions(access.organizationId)
      return c.json({ functions: functions.map(serializeSummary) })
    })
    .get('/functions/:id', async (c) => {
      const functionId = parseFunctionId(c.req.param('id'))
      if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      try {
        const details = await runner.getFunction(
          access.organizationId,
          functionId,
        )
        return c.json({
          function: serializeDefinition(details.definition),
          revisions: details.revisions.map(serializeRevision),
        })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .get('/functions/:id/executions', async (c) => {
      const functionId = parseFunctionId(c.req.param('id'))
      if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      try {
        const executions = await runner.listExecutions(
          access.organizationId,
          functionId,
        )
        return c.json({ executions: executions.map(serializeExecutionHistory) })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .post(
      '/functions',
      zValidator('json', createRunnerFunctionSchema),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const definition = await runner.createFunction(
            access.organizationId,
            c.req.valid('json'),
          )
          return c.json({ function: serializeDefinition(definition) }, 201)
        } catch (error) {
          return handleRunnerError(c, error)
        }
      },
    )
    .patch(
      '/functions/:id',
      zValidator('json', updateRunnerFunctionSchema),
      async (c) => {
        const functionId = parseFunctionId(c.req.param('id'))
        if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const definition = await runner.updateFunction(
            access.organizationId,
            functionId,
            c.req.valid('json'),
          )
          return c.json({ function: serializeDefinition(definition) })
        } catch (error) {
          return handleRunnerError(c, error)
        }
      },
    )
    .post('/functions/:id/archive', async (c) => {
      const functionId = parseFunctionId(c.req.param('id'))
      if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        const definition = await runner.archiveFunction(
          access.organizationId,
          functionId,
        )
        return c.json({ function: serializeDefinition(definition) })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .delete('/functions/:id', async (c) => {
      const functionId = parseFunctionId(c.req.param('id'))
      if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        await runner.deleteFunction(access.organizationId, functionId)
        return c.json({ deleted: true as const, functionId })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .post('/functions/:id/revisions/:revision/restore', async (c) => {
      const functionId = parseFunctionId(c.req.param('id'))
      const revision = parseFunctionId(c.req.param('revision'))
      if (!functionId || !revision) {
        return c.json({ message: 'Invalid function or revision ID' }, 400)
      }
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        const definition = await runner.restoreRevision(
          access.organizationId,
          functionId,
          revision,
        )
        return c.json({ function: serializeDefinition(definition) }, 201)
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .get('/mcps', async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      const mcps = await runner.listMcps(access.organizationId)
      return c.json({ mcps: mcps.map(serializeMcpSummary) })
    })
    .post(
      '/mcps/import/inspect',
      zValidator('json', runnerMcpImportInspectSchema),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const imported = parseRunnerMcpPackageYaml(c.req.valid('json').yaml)
          const preview = await runner.inspectMcpImport(
            access.organizationId,
            imported,
          )
          return c.json({ preview })
        } catch (error) {
          return c.json({ message: getMcpPackageError(error) }, 400)
        }
      },
    )
    .post(
      '/mcps/import',
      zValidator('json', runnerMcpImportSchema),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const input = c.req.valid('json')
          const imported = parseRunnerMcpPackageYaml(input.yaml)
          const result = await runner.importMcpPackage(
            access.organizationId,
            imported,
            input.overwrite,
          )
          if (result.status === 'blocked') {
            return c.json(
              {
                code: 'MCP_IMPORT_BLOCKED' as const,
                message: 'MCP import has blocking conflicts',
                preview: result.preview,
              },
              409,
            )
          }
          if (result.status === 'overwrite_required') {
            return c.json(
              {
                code: 'MCP_IMPORT_OVERWRITE_REQUIRED' as const,
                message: 'Confirm replacement of the existing MCP',
                preview: result.preview,
              },
              409,
            )
          }
          return c.json({ mcp: serializeMcp(result.mcp) })
        } catch (error) {
          return c.json({ message: getMcpPackageError(error) }, 400)
        }
      },
    )
    .get('/mcps/:id', async (c) => {
      const mcpId = parseFunctionId(c.req.param('id'))
      if (!mcpId) return c.json({ message: 'Invalid MCP ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      try {
        const mcp = await runner.getMcp(access.organizationId, mcpId)
        return c.json({ mcp: serializeMcp(mcp) })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .get('/mcps/:id/export', async (c) => {
      const mcpId = parseFunctionId(c.req.param('id'))
      if (!mcpId) return c.json({ message: 'Invalid MCP ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        const exported = await runner.exportMcpPackage(
          access.organizationId,
          mcpId,
        )
        const yaml = stringifyRunnerMcpPackageYaml(exported)
        c.header('Content-Type', 'application/yaml; charset=utf-8')
        c.header(
          'Content-Disposition',
          `attachment; filename="${exported.mcp.name}.mcpx"`,
        )
        c.header('Cache-Control', 'private, no-store')
        return c.body(yaml)
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .post('/mcps', zValidator('json', createRunnerMcpSchema), async (c) => {
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        const mcp = await runner.createMcp(
          access.organizationId,
          c.req.valid('json'),
        )
        return c.json({ mcp: serializeMcp(mcp) }, 201)
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .patch(
      '/mcps/:id',
      zValidator('json', updateRunnerMcpSchema),
      async (c) => {
        const mcpId = parseFunctionId(c.req.param('id'))
        if (!mcpId) return c.json({ message: 'Invalid MCP ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const mcp = await runner.updateMcp(
            access.organizationId,
            mcpId,
            c.req.valid('json'),
          )
          return c.json({ mcp: serializeMcp(mcp) })
        } catch (error) {
          return handleRunnerError(c, error)
        }
      },
    )
    .delete('/mcps/:id', async (c) => {
      const mcpId = parseFunctionId(c.req.param('id'))
      if (!mcpId) return c.json({ message: 'Invalid MCP ID' }, 400)
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        await runner.deleteMcp(access.organizationId, mcpId)
        return c.json({ deleted: true as const, mcpId })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .get('/api-keys', async (c) => {
      const access = await getManagementAccess(c.req.raw.headers, getAccess)
      if ('response' in access) return access.response(c)
      try {
        const apiKeys = await runner.listApiKeys(access.organizationId)
        return c.json({ apiKeys: apiKeys.map(serializeApiKeyMetadata) })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .post(
      '/api-keys',
      zValidator('json', createRunnerApiKeySchema),
      async (c) => {
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const apiKey = await runner.createApiKey(
            access.organizationId,
            c.req.valid('json'),
          )
          return c.json({ apiKey: serializeApiKey(apiKey) }, 201)
        } catch (error) {
          return handleRunnerError(c, error)
        }
      },
    )
    .delete('/api-keys/:apiKeyId', async (c) => {
      const apiKeyId = parseFunctionId(c.req.param('apiKeyId'))
      if (!apiKeyId) {
        return c.json({ message: 'Invalid API key ID' }, 400)
      }
      const access = await getAccess(c.req.raw.headers)
      if (!access) return c.json({ message: 'Unauthorized' }, 401)
      if (!canManageFunctions(access.role)) {
        return c.json({ message: 'Organization owner or admin required' }, 403)
      }
      try {
        await runner.revokeApiKey(access.organizationId, apiKeyId)
        return c.json({ revoked: true as const, apiKeyId })
      } catch (error) {
        return handleRunnerError(c, error)
      }
    })
    .post(
      '/functions/:id/execute-ui',
      zValidator('json', executeRunnerFunctionSchema),
      async (c) => {
        const functionId = parseFunctionId(c.req.param('id'))
        if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
        const access = await getAccess(c.req.raw.headers)
        if (!access) return c.json({ message: 'Unauthorized' }, 401)
        if (!canManageFunctions(access.role)) {
          return c.json(
            { message: 'Organization owner or admin required' },
            403,
          )
        }
        try {
          const execution = await runner.executeFunctionForOrganization(
            access.organizationId,
            functionId,
            c.req.valid('json'),
          )
          return serializeExecutionResponse(c, execution)
        } catch (error) {
          return handleRunnerError(c, error)
        }
      },
    )
    .post(
      '/functions/:id/execute',
      zValidator('header', runnerApiKeyHeadersSchema),
      zValidator('json', executeRunnerFunctionSchema),
      async (c) => {
        const functionId = parseFunctionId(c.req.param('id'))
        if (!functionId) return c.json({ message: 'Invalid function ID' }, 400)
        const apiKey = readApiKey(c.req.raw.headers)
        if (!apiKey) return c.json({ message: 'Runner API key required' }, 401)
        try {
          const execution = await runner.executeFunction(
            functionId,
            apiKey,
            c.req.valid('json'),
          )
          return serializeExecutionResponse(c, execution)
        } catch (error) {
          return handleRunnerError(c, error)
        }
      },
    )

async function getOrganizationAccess(
  headers: Headers,
): Promise<OrganizationAccess | undefined> {
  const session = await auth.api.getSession({ headers })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return undefined
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1)
  return membership ? { organizationId, role: membership.role } : undefined
}

async function getManagementAccess(
  headers: Headers,
  getAccess: NonNullable<RunnerRouteOptions['getAccess']>,
) {
  const access = await getAccess(headers)
  if (!access) {
    return {
      response: (c: Parameters<Parameters<Hono['onError']>[0]>[1]) =>
        c.json({ message: 'Unauthorized' }, 401),
    } as const
  }
  if (!canManageFunctions(access.role)) {
    return {
      response: (c: Parameters<Parameters<Hono['onError']>[0]>[1]) =>
        c.json({ message: 'Organization owner or admin required' }, 403),
    } as const
  }
  return access
}

function canManageFunctions(role: string): boolean {
  return role
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === 'owner' || value === 'admin')
}

function parseFunctionId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const functionId = Number(value)
  return Number.isSafeInteger(functionId) ? functionId : undefined
}

function serializeDefinition(definition: RunnerFunctionDefinition) {
  return {
    ...definition,
    archivedAt: definition.archivedAt?.toISOString() ?? null,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    revision: {
      ...definition.revision,
      createdAt: definition.revision.createdAt.toISOString(),
    },
  }
}

function serializeSummary(summary: RunnerFunctionSummary) {
  return {
    ...summary,
    archivedAt: summary.archivedAt?.toISOString() ?? null,
    createdAt: summary.createdAt.toISOString(),
    updatedAt: summary.updatedAt.toISOString(),
  }
}

function serializeRevision(
  revision: RunnerFunctionDetails['revisions'][number],
) {
  return { ...revision, createdAt: revision.createdAt.toISOString() }
}

function serializeMcpSummary(mcp: RunnerMcpSummary) {
  return {
    id: mcp.id,
    organizationId: mcp.organizationId,
    name: mcp.name,
    description: mcp.description,
    functionCount: mcp.functionCount,
    functionNames: mcp.functionNames,
    createdAt: mcp.createdAt.toISOString(),
    updatedAt: mcp.updatedAt.toISOString(),
  }
}

function serializeMcp(mcp: RunnerMcpDefinition) {
  return { ...serializeMcpSummary(mcp), functions: mcp.functions }
}

function serializeExecution(execution: RunnerExecutionResult) {
  return {
    ...execution,
    startedAt: execution.startedAt.toISOString(),
    finishedAt: execution.finishedAt.toISOString(),
  }
}

function serializeExecutionHistory(execution: RunnerExecutionHistoryEntry) {
  return {
    ...execution,
    startedAt: execution.startedAt.toISOString(),
    finishedAt: execution.finishedAt?.toISOString() ?? null,
  }
}

function serializeExecutionResponse(
  c: Parameters<Parameters<Hono['onError']>[0]>[1],
  execution: RunnerExecutionResult,
) {
  const body = { execution: serializeExecution(execution) }
  if (execution.status === 'timed_out') return c.json(body, 408)
  if (execution.status === 'failed') return c.json(body, 422)
  return c.json(body)
}

function serializeApiKey(apiKey: CreatedRunnerApiKey) {
  return {
    ...apiKey,
    expiresAt: apiKey.expiresAt.toISOString(),
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  }
}

function serializeApiKeyMetadata(apiKey: RunnerApiKeyMetadata) {
  return {
    ...apiKey,
    expiresAt: apiKey.expiresAt.toISOString(),
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  }
}

function readApiKey(headers: Headers): string | undefined {
  const direct = headers.get('x-api-key')?.trim()
  if (direct) return direct
  const authorization = headers.get('authorization')
  const match = authorization ? /^Bearer\s+(\S+)$/i.exec(authorization) : null
  return match?.[1]
}

function handleRunnerError(
  c: Parameters<Parameters<Hono['onError']>[0]>[1],
  error: unknown,
) {
  if (error instanceof RunnerApiKeyInvalidError) {
    return c.json({ message: error.message }, 401)
  }
  if (error instanceof RunnerApiKeyScopeError) {
    return c.json(
      {
        message: error.message,
        functionIds: error.functionIds,
        mcpIds: error.mcpIds,
      },
      400,
    )
  }
  if (error instanceof RunnerMcpNotFoundError) {
    return c.json({ message: error.message }, 404)
  }
  if (error instanceof RunnerMcpNameConflictError) {
    return c.json(
      { code: 'MCP_NAME_CONFLICT' as const, message: error.message },
      409,
    )
  }
  if (error instanceof RunnerMcpInUseError) {
    return c.json(
      { code: 'MCP_USED_BY_AGENT' as const, message: error.message },
      409,
    )
  }
  if (error instanceof RunnerFunctionNotFoundError) {
    return c.json({ message: error.message }, 404)
  }
  if (error instanceof RunnerFunctionNameConflictError) {
    return c.json(
      { code: 'FUNCTION_NAME_CONFLICT' as const, message: error.message },
      409,
    )
  }
  if (error instanceof RunnerFunctionArchivedError) {
    return c.json(
      { code: 'FUNCTION_ARCHIVED' as const, message: error.message },
      409,
    )
  }
  if (error instanceof RunnerFunctionExecutionInProgressError) {
    return c.json(
      {
        code: 'FUNCTION_EXECUTION_IN_PROGRESS' as const,
        message: error.message,
      },
      409,
    )
  }
  if (error instanceof RunnerParameterValidationError) {
    return c.json({ message: error.message }, 400)
  }
  if (error instanceof RunnerExecutionDispatchTimeoutError) {
    return c.json({ message: error.message }, 503)
  }
  throw error
}

function getMcpPackageError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Invalid MCP package'
}
