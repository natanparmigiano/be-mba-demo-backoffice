import { z } from 'zod'
import {
  RUNNER_ENTITY_NAME_MAX_LENGTH,
  runnerFunctionCodeSchema,
  runnerFunctionNameSchema,
  runnerMcpNameSchema,
  runnerParameterListSchema,
} from './schemas.js'

export const RUNNER_MCP_PACKAGE_FORMAT = 'mba-mcp'
export const RUNNER_MCP_PACKAGE_VERSION = 1
export const RUNNER_MCP_PACKAGE_MAX_BYTES = 10 * 1024 * 1024
export const RUNNER_MCP_PACKAGE_FUNCTION_LIMIT = 1_000
export const RUNNER_MCP_PACKAGE_REVISION_LIMIT = 1_000

const runnerMcpPackageRevisionSchema = z
  .object({
    revision: z.number().int().positive(),
    code: runnerFunctionCodeSchema,
    parameters: runnerParameterListSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

const runnerMcpPackageFunctionSchema = z
  .object({
    name: runnerFunctionNameSchema,
    description: z.string().trim().max(2_000).nullable(),
    currentRevision: z.number().int().positive(),
    revisions: z
      .array(runnerMcpPackageRevisionSchema)
      .min(1)
      .max(RUNNER_MCP_PACKAGE_REVISION_LIMIT),
  })
  .strict()
  .superRefine(({ currentRevision, revisions }, context) => {
    for (const [index, revision] of revisions.entries()) {
      if (revision.revision !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: 'Function revisions must be contiguous and start at 1',
          path: ['revisions', index, 'revision'],
        })
      }
    }
    if (currentRevision !== revisions.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current revision must be the latest exported revision',
        path: ['currentRevision'],
      })
    }
  })

export const runnerMcpPackageSchema = z
  .object({
    format: z.literal(RUNNER_MCP_PACKAGE_FORMAT),
    version: z.literal(RUNNER_MCP_PACKAGE_VERSION),
    mcp: z
      .object({
        name: runnerMcpNameSchema,
        description: z.string().trim().max(2_000).nullable(),
        functions: z
          .array(runnerMcpPackageFunctionSchema)
          .min(1)
          .max(RUNNER_MCP_PACKAGE_FUNCTION_LIMIT),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ mcp }, context) => {
    const names = new Set<string>()
    for (const [index, fn] of mcp.functions.entries()) {
      if (names.has(fn.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate exported function name: ${fn.name}`,
          path: ['mcp', 'functions', index, 'name'],
        })
      }
      names.add(fn.name)
    }
  })

export type RunnerMcpPackage = z.infer<typeof runnerMcpPackageSchema>

export type RunnerMcpImportBlocker =
  | { code: 'active_executions'; functionNames: string[] }
  | { code: 'duplicate_target_names'; functionNames: string[] }
  | { code: 'shared_functions'; functionNames: string[] }
  | { code: 'target_name_conflicts'; functionNames: string[] }
  | { code: 'target_names_too_long'; functionNames: string[] }

export interface RunnerMcpImportPreviewFunction {
  sourceName: string
  targetName: string
  currentRevision: number
  revisionCount: number
}

export interface RunnerMcpImportPreview {
  mode: 'create' | 'overwrite'
  existingMcpId: number | null
  mcpName: string
  description: string | null
  functions: RunnerMcpImportPreviewFunction[]
  removedFunctionNames: string[]
  affectedApiKeyCount: number
  affectedExecutionCount: number
  blockers: RunnerMcpImportBlocker[]
  canImport: boolean
}

export function getRunnerMcpImportTargetName(
  mcpName: string,
  functionName: string,
): string {
  const prefix = `${mcpName}__`
  return functionName.startsWith(prefix)
    ? functionName
    : `${prefix}${functionName}`
}

export function isRunnerMcpImportTargetNameValid(name: string): boolean {
  return (
    name.length <= RUNNER_ENTITY_NAME_MAX_LENGTH &&
    runnerFunctionNameSchema.safeParse(name).success
  )
}
