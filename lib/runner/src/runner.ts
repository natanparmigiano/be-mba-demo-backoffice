import { createHash, randomBytes } from 'node:crypto'
import {
  IsolatedVmExecutor,
  validateRunnerFunctionCode,
  type RunnerExecutor,
} from './executor.js'
import { PostgresRunnerRepository } from './repository.js'
import type { RunnerExecutionPublisher } from './events.js'
import {
  runnerMcpPackageSchema,
  type RunnerMcpImportPreview,
  type RunnerMcpPackage,
} from './mcp-package.js'
import {
  createRunnerApiKeySchema,
  createRunnerFunctionSchema,
  createRunnerMcpSchema,
  executeRunnerFunctionSchema,
  updateRunnerFunctionSchema,
  updateRunnerMcpSchema,
  type CreateRunnerApiKeyInput,
  type CreateRunnerFunctionInput,
  type CreateRunnerMcpInput,
  type ExecuteRunnerFunctionInput,
  type RunnerParameterDefinition,
  type UpdateRunnerFunctionInput,
  type UpdateRunnerMcpInput,
} from './schemas.js'
import type {
  CreatedRunnerApiKey,
  RunnerClaimedExecution,
  RunnerExecutionResult,
  RunnerExecutionHistoryEntry,
  RunnerExecutionRevision,
  RunnerFunctionDefinition,
  RunnerFunctionDetails,
  RunnerFunctionSummary,
  RunnerMcpDefinition,
  RunnerMcpImportResult,
  RunnerMcpRuntimeDefinition,
  RunnerMcpSummary,
  RunnerApiKeyMetadata,
  RunnerRepository,
} from './types.js'

export interface RunnerOptions {
  repository?: RunnerRepository
  executor?: RunnerExecutor
  executionPublisher?: RunnerExecutionPublisher
  executionWaitTimeoutMs?: number
  timeoutMs?: number
  memoryLimitMb?: number
}

export const DEFAULT_RUNNER_EXECUTION_WAIT_TIMEOUT_MS = 30_000
const RUNNER_EXECUTION_POLL_INTERVAL_MS = 25

export class RunnerFunctionNotFoundError extends Error {
  constructor() {
    super('Runner function or revision not found')
    this.name = 'RunnerFunctionNotFoundError'
  }
}

export class RunnerFunctionArchivedError extends Error {
  constructor() {
    super('Runner function is archived')
    this.name = 'RunnerFunctionArchivedError'
  }
}

export class RunnerFunctionExecutionInProgressError extends Error {
  constructor() {
    super('Wait for queued or running executions before deleting this function')
    this.name = 'RunnerFunctionExecutionInProgressError'
  }
}

export class RunnerFunctionNameConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      'A runner function already uses this name in the organization',
      options,
    )
    this.name = 'RunnerFunctionNameConflictError'
  }
}

export class RunnerMcpNotFoundError extends Error {
  constructor() {
    super('MCP not found')
    this.name = 'RunnerMcpNotFoundError'
  }
}

export class RunnerMcpNameConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super('An MCP already uses this name in the organization', options)
    this.name = 'RunnerMcpNameConflictError'
  }
}

export class RunnerMcpAccessForbiddenError extends Error {
  constructor() {
    super('Runner API key does not grant access to this MCP')
    this.name = 'RunnerMcpAccessForbiddenError'
  }
}

export class RunnerParameterValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunnerParameterValidationError'
  }
}

export class RunnerApiKeyInvalidError extends Error {
  constructor() {
    super('Invalid or expired runner API key')
    this.name = 'RunnerApiKeyInvalidError'
  }
}

export class RunnerApiKeyScopeError extends Error {
  readonly functionIds: number[]
  readonly mcpIds: number[]

  constructor(functionIds: number[], mcpIds: number[] = []) {
    super(
      'One or more allowed functions or MCPs do not belong to the organization',
    )
    this.name = 'RunnerApiKeyScopeError'
    this.functionIds = functionIds
    this.mcpIds = mcpIds
  }
}

export class RunnerExecutionDispatchTimeoutError extends Error {
  constructor() {
    super('Runner execution worker did not complete before the wait timeout')
    this.name = 'RunnerExecutionDispatchTimeoutError'
  }
}

export class Runner {
  readonly #repository: RunnerRepository
  readonly #executor: RunnerExecutor
  readonly #timeoutMs: number | undefined
  readonly #memoryLimitMb: number | undefined
  readonly #executionPublisher: RunnerExecutionPublisher | undefined
  readonly #executionWaitTimeoutMs: number

  constructor({
    repository = new PostgresRunnerRepository(),
    executor = new IsolatedVmExecutor(),
    executionPublisher,
    executionWaitTimeoutMs = DEFAULT_RUNNER_EXECUTION_WAIT_TIMEOUT_MS,
    timeoutMs,
    memoryLimitMb,
  }: RunnerOptions = {}) {
    if (
      !Number.isSafeInteger(executionWaitTimeoutMs) ||
      executionWaitTimeoutMs <= 0
    ) {
      throw new RangeError('executionWaitTimeoutMs must be a positive integer')
    }
    this.#repository = repository
    this.#executor = executor
    this.#executionPublisher = executionPublisher
    this.#executionWaitTimeoutMs = executionWaitTimeoutMs
    this.#timeoutMs = timeoutMs
    this.#memoryLimitMb = memoryLimitMb
  }

  async listFunctions(
    organizationId: string,
  ): Promise<RunnerFunctionSummary[]> {
    assertOrganizationId(organizationId)
    return this.#repository.listFunctions(organizationId)
  }

  async getFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerFunctionDetails> {
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    const result = await this.#repository.getFunction(
      organizationId,
      functionId,
    )
    if (result.status === 'not_found') throw new RunnerFunctionNotFoundError()
    return result.details
  }

  async createFunction(
    organizationId: string,
    input: CreateRunnerFunctionInput,
  ): Promise<RunnerFunctionDefinition> {
    const parsed = createRunnerFunctionSchema.parse(input)
    assertOrganizationId(organizationId)
    validateRunnerFunctionCode(parsed.code)
    try {
      return await this.#repository.createFunction(organizationId, parsed)
    } catch (error) {
      throwNameConflict(error)
    }
  }

  async updateFunction(
    organizationId: string,
    functionId: number,
    input: UpdateRunnerFunctionInput,
  ): Promise<RunnerFunctionDefinition> {
    const parsed = updateRunnerFunctionSchema.parse(input)
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    validateRunnerFunctionCode(parsed.code)
    try {
      const result = await this.#repository.updateFunction(
        organizationId,
        functionId,
        parsed,
      )
      if (result.status === 'not_found') throw new RunnerFunctionNotFoundError()
      if (result.status === 'archived') throw new RunnerFunctionArchivedError()
      return result.definition
    } catch (error) {
      throwNameConflict(error)
    }
  }

  async archiveFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerFunctionDefinition> {
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    const result = await this.#repository.archiveFunction(
      organizationId,
      functionId,
    )
    if (result.status === 'not_found') throw new RunnerFunctionNotFoundError()
    return result.definition
  }

  async deleteFunction(
    organizationId: string,
    functionId: number,
  ): Promise<void> {
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    const result = await this.#repository.deleteFunction(
      organizationId,
      functionId,
    )
    if (result.status === 'not_found') throw new RunnerFunctionNotFoundError()
    if (result.status === 'execution_in_progress') {
      throw new RunnerFunctionExecutionInProgressError()
    }
  }

  async restoreRevision(
    organizationId: string,
    functionId: number,
    revision: number,
  ): Promise<RunnerFunctionDefinition> {
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    assertFunctionId(revision)
    const result = await this.#repository.restoreRevision(
      organizationId,
      functionId,
      revision,
    )
    if (result.status === 'not_found') throw new RunnerFunctionNotFoundError()
    if (result.status === 'archived') throw new RunnerFunctionArchivedError()
    return result.definition
  }

  async listMcps(organizationId: string): Promise<RunnerMcpSummary[]> {
    assertOrganizationId(organizationId)
    const result = await this.#repository.listMcps(organizationId)
    return result.mcps
  }

  async getMcp(
    organizationId: string,
    mcpId: number,
  ): Promise<RunnerMcpDefinition> {
    assertOrganizationId(organizationId)
    assertFunctionId(mcpId)
    const result = await this.#repository.getMcp(organizationId, mcpId)
    if (result.status === 'not_found') throw new RunnerMcpNotFoundError()
    return result.mcp
  }

  async createMcp(
    organizationId: string,
    input: CreateRunnerMcpInput,
  ): Promise<RunnerMcpDefinition> {
    const parsed = createRunnerMcpSchema.parse(input)
    assertOrganizationId(organizationId)
    try {
      const result = await this.#repository.createMcp(organizationId, parsed)
      if (result.status === 'invalid_function_ids') {
        throw new RunnerApiKeyScopeError(result.functionIds)
      }
      return result.mcp
    } catch (error) {
      throwMcpNameConflict(error)
    }
  }

  async updateMcp(
    organizationId: string,
    mcpId: number,
    input: UpdateRunnerMcpInput,
  ): Promise<RunnerMcpDefinition> {
    const parsed = updateRunnerMcpSchema.parse(input)
    assertOrganizationId(organizationId)
    assertFunctionId(mcpId)
    try {
      const result = await this.#repository.updateMcp(
        organizationId,
        mcpId,
        parsed,
      )
      if (result.status === 'not_found') throw new RunnerMcpNotFoundError()
      if (result.status === 'invalid_function_ids') {
        throw new RunnerApiKeyScopeError(result.functionIds)
      }
      return result.mcp
    } catch (error) {
      throwMcpNameConflict(error)
    }
  }

  async deleteMcp(organizationId: string, mcpId: number): Promise<void> {
    assertOrganizationId(organizationId)
    assertFunctionId(mcpId)
    if (!(await this.#repository.deleteMcp(organizationId, mcpId))) {
      throw new RunnerMcpNotFoundError()
    }
  }

  async exportMcpPackage(
    organizationId: string,
    mcpId: number,
  ): Promise<RunnerMcpPackage> {
    assertOrganizationId(organizationId)
    assertFunctionId(mcpId)
    const exported = await this.#repository.exportMcpPackage(
      organizationId,
      mcpId,
    )
    if (!exported) throw new RunnerMcpNotFoundError()
    return runnerMcpPackageSchema.parse(exported)
  }

  async inspectMcpImport(
    organizationId: string,
    imported: RunnerMcpPackage,
  ): Promise<RunnerMcpImportPreview> {
    assertOrganizationId(organizationId)
    const parsed = validateMcpPackage(imported)
    return this.#repository.inspectMcpImport(organizationId, parsed)
  }

  async importMcpPackage(
    organizationId: string,
    imported: RunnerMcpPackage,
    overwrite: boolean,
  ): Promise<RunnerMcpImportResult> {
    assertOrganizationId(organizationId)
    const parsed = validateMcpPackage(imported)
    return this.#repository.importMcpPackage(organizationId, parsed, overwrite)
  }

  async getMcpRuntime(
    mcpId: number,
    apiKey: string,
  ): Promise<RunnerMcpRuntimeDefinition> {
    assertFunctionId(mcpId)
    assertApiKey(apiKey)
    const result = await this.#repository.getMcpRuntimeByApiKey(
      mcpId,
      hashApiKey(apiKey),
    )
    if (result.status === 'invalid_key') throw new RunnerApiKeyInvalidError()
    if (result.status === 'not_found') throw new RunnerMcpNotFoundError()
    if (result.status === 'forbidden') {
      throw new RunnerMcpAccessForbiddenError()
    }
    return result.mcp
  }

  async listExecutions(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerExecutionHistoryEntry[]> {
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    const result = await this.#repository.listExecutions(
      organizationId,
      functionId,
    )
    if (result.status === 'not_found') throw new RunnerFunctionNotFoundError()
    return result.executions
  }

  async listApiKeys(organizationId: string): Promise<RunnerApiKeyMetadata[]> {
    assertOrganizationId(organizationId)
    const result = await this.#repository.listApiKeys(organizationId)
    return result.apiKeys
  }

  async createApiKey(
    organizationId: string,
    input: CreateRunnerApiKeyInput,
  ): Promise<CreatedRunnerApiKey> {
    const parsed = createRunnerApiKeySchema.parse(input)
    assertOrganizationId(organizationId)
    if (parsed.expiresAt.getTime() <= Date.now()) {
      throw new TypeError('expiresAt must be in the future')
    }
    const apiKey = `rnr_${randomBytes(32).toString('base64url')}`
    const result = await this.#repository.createApiKey(organizationId, {
      ...parsed,
      keyPrefix: apiKey.slice(0, 12),
      keyHash: hashApiKey(apiKey),
    })
    if (result.status === 'invalid_scope_ids') {
      throw new RunnerApiKeyScopeError(result.functionIds, result.mcpIds)
    }
    return { ...result.apiKey, apiKey }
  }

  async revokeApiKey(organizationId: string, apiKeyId: number): Promise<void> {
    assertOrganizationId(organizationId)
    assertFunctionId(apiKeyId)
    if (!(await this.#repository.revokeApiKey(organizationId, apiKeyId))) {
      throw new RunnerFunctionNotFoundError()
    }
  }

  async executeFunctionForOrganization(
    organizationId: string,
    functionId: number,
    input: ExecuteRunnerFunctionInput,
  ): Promise<RunnerExecutionResult> {
    const parsed = executeRunnerFunctionSchema.parse(input)
    assertOrganizationId(organizationId)
    assertFunctionId(functionId)
    const apiKey = `rnr_${randomBytes(32).toString('base64url')}`
    const uiKey = await this.#repository.upsertUiApiKey(organizationId, {
      keyPrefix: apiKey.slice(0, 12),
      keyHash: hashApiKey(apiKey),
      expiresAt: new Date(Date.now() + 5 * 60_000),
    })
    const execution =
      await this.#repository.getExecutionRevisionForOrganization(
        organizationId,
        functionId,
        uiKey.id,
        parsed.revision,
      )
    if (!execution) throw new RunnerFunctionNotFoundError()
    if (execution.functionStatus === 'archived') {
      throw new RunnerFunctionArchivedError()
    }
    return this.#executeResolved(execution, parsed)
  }

  async executeFunction(
    functionId: number,
    apiKey: string,
    input: ExecuteRunnerFunctionInput,
  ): Promise<RunnerExecutionResult> {
    const parsed = executeRunnerFunctionSchema.parse(input)
    assertFunctionId(functionId)
    assertApiKey(apiKey)
    const execution = await this.#repository.getExecutionRevisionByApiKey(
      functionId,
      hashApiKey(apiKey),
      parsed.revision,
    )
    if (!execution) throw new RunnerApiKeyInvalidError()
    if (execution.functionStatus === 'archived') {
      throw new RunnerFunctionArchivedError()
    }
    return this.#executeResolved(execution, parsed)
  }

  async executeMcpFunction(
    mcpId: number,
    functionId: number,
    apiKey: string,
    parameters: Record<string, unknown>,
  ): Promise<RunnerExecutionResult> {
    const parsed = executeRunnerFunctionSchema.parse({ arguments: parameters })
    assertFunctionId(mcpId)
    assertFunctionId(functionId)
    assertApiKey(apiKey)
    const execution = await this.#repository.getMcpExecutionRevisionByApiKey(
      mcpId,
      functionId,
      hashApiKey(apiKey),
    )
    if (!execution) throw new RunnerApiKeyInvalidError()
    if (execution.functionStatus === 'archived') {
      throw new RunnerFunctionArchivedError()
    }
    return this.#executeResolved(execution, parsed)
  }

  async #executeResolved(
    execution: RunnerExecutionRevision,
    input: ExecuteRunnerFunctionInput,
  ): Promise<RunnerExecutionResult> {
    const parameters = validateParameters(
      execution.revision.parameters,
      input.arguments,
    )
    const log = await this.#repository.createExecutionLog(execution, parameters)
    if (!this.#executionPublisher) {
      return this.#executeClaimed({
        executionId: log.id,
        functionId: execution.functionId,
        revision: execution.revision.revision,
        code: execution.revision.code,
        parameters,
        startedAt: log.startedAt,
      })
    }

    try {
      await this.#executionPublisher(log.id)
    } catch (error) {
      const finishedAt = new Date()
      const errorMessage = getErrorMessage(error)
      await this.#repository.finishExecutionLog(log.id, {
        status: 'failed',
        errorMessage,
        durationMs: 0,
        finishedAt,
      })
      return {
        executionId: log.id,
        functionId: execution.functionId,
        revision: execution.revision.revision,
        status: 'failed',
        errorMessage,
        durationMs: 0,
        startedAt: log.startedAt,
        finishedAt,
      }
    }

    return this.#waitForExecution(log.id)
  }

  async executeQueuedExecution(executionId: number): Promise<boolean> {
    assertFunctionId(executionId)
    const execution = await this.#repository.claimExecution(executionId)
    if (!execution) return false
    await this.#executeClaimed(execution)
    return true
  }

  async #waitForExecution(executionId: number): Promise<RunnerExecutionResult> {
    const deadline = Date.now() + this.#executionWaitTimeoutMs
    for (;;) {
      const result = await this.#repository.getExecutionResult(executionId)
      if (result.status === 'finished') return result.execution
      if (result.status === 'not_found') {
        throw new Error('Queued runner execution was not found')
      }
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new RunnerExecutionDispatchTimeoutError()
      await delay(Math.min(RUNNER_EXECUTION_POLL_INTERVAL_MS, remainingMs))
    }
  }

  async #executeClaimed(
    execution: RunnerClaimedExecution,
  ): Promise<RunnerExecutionResult> {
    const started = performance.now()
    let isolatedResult
    try {
      isolatedResult = await this.#executor.execute(
        execution.code,
        execution.parameters,
        { timeoutMs: this.#timeoutMs, memoryLimitMb: this.#memoryLimitMb },
      )
    } catch (error) {
      isolatedResult = {
        status: 'failed' as const,
        errorMessage: getErrorMessage(error),
      }
    }
    const durationMs = Math.max(0, Math.round(performance.now() - started))
    const finishedAt = new Date()

    if (isolatedResult.status === 'succeeded') {
      await this.#repository.finishExecutionLog(execution.executionId, {
        status: 'succeeded',
        result: isolatedResult.result,
        durationMs,
        finishedAt,
      })
      return {
        executionId: execution.executionId,
        functionId: execution.functionId,
        revision: execution.revision,
        status: 'succeeded',
        result: isolatedResult.result,
        durationMs,
        startedAt: execution.startedAt,
        finishedAt,
      }
    }

    await this.#repository.finishExecutionLog(execution.executionId, {
      status: isolatedResult.status,
      errorMessage: isolatedResult.errorMessage,
      durationMs,
      finishedAt,
    })
    return {
      executionId: execution.executionId,
      functionId: execution.functionId,
      revision: execution.revision,
      status: isolatedResult.status,
      errorMessage: isolatedResult.errorMessage,
      durationMs,
      startedAt: execution.startedAt,
      finishedAt,
    }
  }
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

function validateParameters(
  definitions: RunnerParameterDefinition[],
  supplied: Record<string, unknown>,
): Record<string, unknown> {
  const definitionsByName = new Map(
    definitions.map((definition) => [definition.name, definition]),
  )
  for (const name of Object.keys(supplied)) {
    if (!definitionsByName.has(name)) {
      throw new RunnerParameterValidationError(`Unknown parameter: ${name}`)
    }
  }
  for (const definition of definitions) {
    if (!(definition.name in supplied)) {
      if (definition.required) {
        throw new RunnerParameterValidationError(
          `Missing required parameter: ${definition.name}`,
        )
      }
      continue
    }
    const value = supplied[definition.name]
    if (!matchesType(value, definition.type)) {
      throw new RunnerParameterValidationError(
        `Parameter ${definition.name} must be ${definition.type}`,
      )
    }
  }
  assertJsonSerializable(supplied)
  return supplied
}

function matchesType(
  value: unknown,
  type: RunnerParameterDefinition['type'],
): boolean {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value)
    case 'json':
      try {
        assertJsonSerializable(value)
        return true
      } catch {
        return false
      }
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'string':
      return typeof value === 'string'
  }
}

function assertJsonSerializable(value: unknown): void {
  try {
    if (JSON.stringify(value) === undefined) throw new Error()
  } catch {
    throw new RunnerParameterValidationError(
      'Function parameters must be JSON-serializable',
    )
  }
}

function assertOrganizationId(organizationId: string): void {
  if (organizationId.trim().length === 0) {
    throw new TypeError('organizationId is required')
  }
}

function assertFunctionId(functionId: number): void {
  if (!Number.isSafeInteger(functionId) || functionId <= 0) {
    throw new TypeError('functionId must be a positive safe integer')
  }
}

function assertApiKey(apiKey: string): void {
  if (!/^rnr_[A-Za-z0-9_-]{40,60}$/.test(apiKey)) {
    throw new RunnerApiKeyInvalidError()
  }
}

function throwNameConflict(error: unknown): never {
  if (getDatabaseErrorCode(error) === '23505') {
    throw new RunnerFunctionNameConflictError({ cause: error })
  }
  throw error
}

function throwMcpNameConflict(error: unknown): never {
  if (
    error instanceof RunnerApiKeyScopeError ||
    error instanceof RunnerMcpNotFoundError
  ) {
    throw error
  }
  if (getDatabaseErrorCode(error) === '23505') {
    throw new RunnerMcpNameConflictError({ cause: error })
  }
  throw error
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  const visited = new Set<object>()
  let current = error
  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) return undefined
    visited.add(current)
    if ('code' in current && typeof current.code === 'string') {
      return current.code
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

function getErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    4_000,
  )
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function validateMcpPackage(imported: RunnerMcpPackage): RunnerMcpPackage {
  const parsed = runnerMcpPackageSchema.parse(imported)
  for (const fn of parsed.mcp.functions) {
    for (const revision of fn.revisions) {
      validateRunnerFunctionCode(revision.code)
    }
  }
  return parsed
}
