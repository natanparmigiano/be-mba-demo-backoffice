import {
  RunnerApiKeyInvalidError,
  RunnerFunctionArchivedError,
  RunnerFunctionNotFoundError,
  RunnerParameterValidationError,
  type RunnerExecutionResult,
  type RunnerMcpRuntimeDefinition,
  type RunnerParameterDefinition,
} from '@mba-desk/runner'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

export type ExecuteMcpTool = (
  functionId: number,
  parameters: Record<string, unknown>,
) => Promise<RunnerExecutionResult>

export function createRunnerMcpServer(
  runtime: RunnerMcpRuntimeDefinition,
  execute: ExecuteMcpTool,
): McpServer {
  const server = new McpServer(
    { name: runtime.name, version: '1.0.0' },
    runtime.description ? { instructions: runtime.description } : undefined,
  )

  for (const runnerFunction of runtime.functions) {
    server.registerTool(
      runnerFunction.name,
      {
        description: runnerFunction.description ?? undefined,
        inputSchema: createInputSchema(runnerFunction.parameters),
      },
      async (parameters) => {
        try {
          const execution = await execute(runnerFunction.id, parameters)
          if (execution.status === 'succeeded') {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(execution.result ?? null),
                },
              ],
            }
          }
          return toolError(execution.errorMessage)
        } catch (error) {
          if (
            error instanceof RunnerApiKeyInvalidError ||
            error instanceof RunnerFunctionArchivedError ||
            error instanceof RunnerFunctionNotFoundError ||
            error instanceof RunnerParameterValidationError
          ) {
            return toolError(error.message)
          }
          console.error('Unexpected MCP tool execution failure', {
            errorName: error instanceof Error ? error.name : typeof error,
            functionId: runnerFunction.id,
            mcpId: runtime.id,
          })
          return toolError('Tool execution failed')
        }
      },
    )
  }

  return server
}

function createInputSchema(parameters: RunnerParameterDefinition[]) {
  const shape: Record<string, z.ZodType> = {}
  for (const parameter of parameters) {
    let schema = parameterSchema(parameter)
    if (parameter.description) schema = schema.describe(parameter.description)
    shape[parameter.name] = parameter.required ? schema : schema.optional()
  }
  return z.strictObject(shape)
}

function parameterSchema(parameter: RunnerParameterDefinition): z.ZodType {
  switch (parameter.type) {
    case 'boolean':
      return z.boolean()
    case 'integer':
      return z.number().int().safe()
    case 'json':
      return z.json()
    case 'number':
      return z.number()
    case 'string':
      return z.string()
  }
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message.slice(0, 4_000) }],
    isError: true as const,
  }
}
