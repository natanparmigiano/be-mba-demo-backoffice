import {
  RunnerApiKeyInvalidError,
  RunnerMcpAccessForbiddenError,
  RunnerMcpNotFoundError,
  runner as defaultRunner,
  type RunnerExecutionResult,
  type RunnerMcpRuntimeDefinition,
} from '@mba-desk/runner'
import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Context } from 'hono'
import { createRunnerMcpServer } from '../mcp-server.js'

const MCP_REQUEST_BODY_LIMIT = 256 * 1024

export interface McpRunnerApi {
  getMcpRuntime(
    mcpId: number,
    apiKey: string,
  ): Promise<RunnerMcpRuntimeDefinition>
  executeMcpFunction(
    mcpId: number,
    functionId: number,
    apiKey: string,
    parameters: Record<string, unknown>,
  ): Promise<RunnerExecutionResult>
}

export interface McpRouteOptions {
  runner?: McpRunnerApi
}

export function createMcpRoute({
  runner = defaultRunner,
}: McpRouteOptions = {}) {
  // Host validation is intentionally disabled. Deployments rely on their
  // network boundary plus the runner API key required for every MCP request.
  const route = createMcpHonoApp({
    host: '0.0.0.0',
    maxRequestBodySize: MCP_REQUEST_BODY_LIMIT,
  })

  return route.all('/:mcpId', async (c) => {
    const mcpId = parseMcpId(c.req.param('mcpId'))
    if (!mcpId) return c.json({ message: 'Invalid MCP ID' }, 400)

    const apiKey = readBearerToken(c.req.raw.headers)
    if (!apiKey) return unauthorized(c)

    try {
      const runtime = await runner.getMcpRuntime(mcpId, apiKey)
      const handler = createMcpHandler(
        () =>
          createRunnerMcpServer(runtime, (functionId, parameters) =>
            runner.executeMcpFunction(mcpId, functionId, apiKey, parameters),
          ),
        {
          legacy: 'stateless',
          maxRequestBodySize: MCP_REQUEST_BODY_LIMIT,
          responseMode: 'auto',
        },
      )
      return handler.fetch(c.req.raw, {
        parsedBody: (c.var as Record<string, unknown>).parsedBody,
      })
    } catch (error) {
      if (error instanceof RunnerApiKeyInvalidError) return unauthorized(c)
      if (error instanceof RunnerMcpAccessForbiddenError) {
        return c.json({ message: error.message }, 403)
      }
      if (error instanceof RunnerMcpNotFoundError) {
        return c.json({ message: error.message }, 404)
      }
      throw error
    }
  })
}

function parseMcpId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const mcpId = Number(value)
  return Number.isSafeInteger(mcpId) ? mcpId : undefined
}

function readBearerToken(headers: Headers): string | undefined {
  const authorization = headers.get('authorization')
  const match = authorization ? /^Bearer\s+(\S+)$/i.exec(authorization) : null
  return match?.[1]
}

function unauthorized(c: Context) {
  c.header('WWW-Authenticate', 'Bearer')
  return c.json({ message: 'Runner API key required' }, 401)
}
