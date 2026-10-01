import type {
  CreateRunnerFunctionInput,
  CreateRunnerApiKeyInput,
  CreateRunnerMcpInput,
  RunnerParameterDefinition,
  UpdateRunnerFunctionInput,
  UpdateRunnerMcpInput,
} from './schemas.js'

export type RunnerFunctionStatus = 'active' | 'archived'
export type RunnerTerminalExecutionStatus = 'succeeded' | 'failed' | 'timed_out'
export type RunnerExecutionStatus =
  'queued' | 'running' | RunnerTerminalExecutionStatus

export interface RunnerFunctionRevision {
  id: number
  revision: number
  code: string
  parameters: RunnerParameterDefinition[]
  createdAt: Date
}

export interface RunnerFunctionDefinition {
  id: number
  organizationId: string
  name: string
  description: string | null
  status: RunnerFunctionStatus
  currentRevision: number
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  revision: RunnerFunctionRevision
}

export type RunnerFunctionSummary = Omit<RunnerFunctionDefinition, 'revision'>

export interface RunnerFunctionDetails {
  definition: RunnerFunctionDefinition
  revisions: RunnerFunctionRevision[]
}

export interface RunnerMcpFunction {
  id: number
  name: string
  description: string | null
  currentRevision: number
}

export interface RunnerMcpSummary {
  id: number
  organizationId: string
  name: string
  description: string | null
  functionCount: number
  functionNames: string[]
  createdAt: Date
  updatedAt: Date
}

export interface RunnerMcpDefinition extends RunnerMcpSummary {
  functions: RunnerMcpFunction[]
}

export interface RunnerMcpRuntimeFunction extends RunnerMcpFunction {
  parameters: RunnerParameterDefinition[]
}

export interface RunnerMcpRuntimeDefinition {
  id: number
  organizationId: string
  name: string
  description: string | null
  functions: RunnerMcpRuntimeFunction[]
}

export type RunnerGetMcpRuntimeResult =
  | { status: 'found'; mcp: RunnerMcpRuntimeDefinition }
  | { status: 'invalid_key' }
  | { status: 'not_found' }
  | { status: 'forbidden' }

export type RunnerListMcpsResult = {
  status: 'found'
  mcps: RunnerMcpSummary[]
}

export type RunnerGetMcpResult =
  { status: 'found'; mcp: RunnerMcpDefinition } | { status: 'not_found' }

export type RunnerCreateMcpResult =
  | { status: 'created'; mcp: RunnerMcpDefinition }
  | { status: 'invalid_function_ids'; functionIds: number[] }

export type RunnerMcpMutationResult =
  | { status: 'updated'; mcp: RunnerMcpDefinition }
  | { status: 'not_found' }
  | { status: 'invalid_function_ids'; functionIds: number[] }

export interface RunnerExecutionRevision {
  functionId: number
  organizationId: string
  functionStatus: RunnerFunctionStatus
  apiKeyId?: number
  revision: RunnerFunctionRevision
}

export type RunnerUpdateResult =
  | { status: 'updated'; definition: RunnerFunctionDefinition }
  | { status: 'not_found' }
  | { status: 'archived' }

export type RunnerArchiveResult =
  | { status: 'archived'; definition: RunnerFunctionDefinition }
  | { status: 'not_found' }

export type RunnerGetResult =
  { status: 'found'; details: RunnerFunctionDetails } | { status: 'not_found' }

export type RunnerRestoreResult = RunnerUpdateResult

export type RunnerListApiKeysResult = {
  status: 'found'
  apiKeys: RunnerApiKeyMetadata[]
}

export interface RunnerExecutionLog {
  id: number
  startedAt: Date
}

export interface RunnerExecutionLogOutcome {
  status: RunnerTerminalExecutionStatus
  result?: unknown
  errorMessage?: string
  durationMs: number
  finishedAt: Date
}

export interface RunnerClaimedExecution {
  executionId: number
  functionId: number
  revision: number
  code: string
  parameters: Record<string, unknown>
  startedAt: Date
}

export type RunnerExecutionResultState =
  | { status: 'pending' }
  | { status: 'not_found' }
  | { status: 'finished'; execution: RunnerExecutionResult }

export interface RunnerExecutionHistoryEntry {
  id: number
  functionId: number
  revision: number
  apiKeyName: string | null
  status: RunnerExecutionStatus
  arguments: Record<string, unknown>
  result: unknown
  errorMessage: string | null
  durationMs: number | null
  startedAt: Date
  finishedAt: Date | null
}

export type RunnerListExecutionsResult =
  | { status: 'found'; executions: RunnerExecutionHistoryEntry[] }
  | { status: 'not_found' }

export interface RunnerApiKeyMetadata {
  id: number
  organizationId: string
  allowedFunctionIds: number[] | null
  allowedMcpIds: number[] | null
  name: string
  keyPrefix: string
  expiresAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export interface CreatedRunnerApiKey extends RunnerApiKeyMetadata {
  apiKey: string
}

export type RunnerCreateApiKeyResult =
  | { status: 'created'; apiKey: RunnerApiKeyMetadata }
  | {
      status: 'invalid_scope_ids'
      functionIds: number[]
      mcpIds: number[]
    }

export interface RunnerRepository {
  listFunctions(organizationId: string): Promise<RunnerFunctionSummary[]>
  getFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerGetResult>
  createFunction(
    organizationId: string,
    input: CreateRunnerFunctionInput,
  ): Promise<RunnerFunctionDefinition>
  updateFunction(
    organizationId: string,
    functionId: number,
    input: UpdateRunnerFunctionInput,
  ): Promise<RunnerUpdateResult>
  archiveFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerArchiveResult>
  restoreRevision(
    organizationId: string,
    functionId: number,
    revision: number,
  ): Promise<RunnerRestoreResult>
  listMcps(organizationId: string): Promise<RunnerListMcpsResult>
  getMcp(organizationId: string, mcpId: number): Promise<RunnerGetMcpResult>
  createMcp(
    organizationId: string,
    input: CreateRunnerMcpInput,
  ): Promise<RunnerCreateMcpResult>
  updateMcp(
    organizationId: string,
    mcpId: number,
    input: UpdateRunnerMcpInput,
  ): Promise<RunnerMcpMutationResult>
  deleteMcp(organizationId: string, mcpId: number): Promise<boolean>
  listExecutions(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerListExecutionsResult>
  listApiKeys(organizationId: string): Promise<RunnerListApiKeysResult>
  createApiKey(
    organizationId: string,
    input: CreateRunnerApiKeyInput & { keyPrefix: string; keyHash: string },
  ): Promise<RunnerCreateApiKeyResult>
  upsertUiApiKey(
    organizationId: string,
    input: { keyPrefix: string; keyHash: string; expiresAt: Date },
  ): Promise<RunnerApiKeyMetadata>
  revokeApiKey(organizationId: string, apiKeyId: number): Promise<boolean>
  getMcpRuntimeByApiKey(
    mcpId: number,
    keyHash: string,
  ): Promise<RunnerGetMcpRuntimeResult>
  getExecutionRevisionByApiKey(
    functionId: number,
    keyHash: string,
    revision?: number,
  ): Promise<RunnerExecutionRevision | undefined>
  getMcpExecutionRevisionByApiKey(
    mcpId: number,
    functionId: number,
    keyHash: string,
  ): Promise<RunnerExecutionRevision | undefined>
  getExecutionRevisionForOrganization(
    organizationId: string,
    functionId: number,
    apiKeyId: number,
    revision?: number,
  ): Promise<RunnerExecutionRevision | undefined>
  createExecutionLog(
    execution: RunnerExecutionRevision,
    parameters: Record<string, unknown>,
  ): Promise<RunnerExecutionLog>
  claimExecution(
    executionId: number,
  ): Promise<RunnerClaimedExecution | undefined>
  getExecutionResult(executionId: number): Promise<RunnerExecutionResultState>
  finishExecutionLog(
    executionId: number,
    outcome: RunnerExecutionLogOutcome,
  ): Promise<void>
}

export type RunnerExecutionResult =
  | {
      executionId: number
      functionId: number
      revision: number
      status: 'succeeded'
      result: unknown
      durationMs: number
      startedAt: Date
      finishedAt: Date
    }
  | {
      executionId: number
      functionId: number
      revision: number
      status: 'failed' | 'timed_out'
      errorMessage: string
      durationMs: number
      startedAt: Date
      finishedAt: Date
    }
