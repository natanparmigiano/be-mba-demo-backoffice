import {
  RunnerApiKeyInvalidError,
  RunnerMcpAccessForbiddenError,
  RunnerMcpNotFoundError,
  runner as defaultRunner,
  type RunnerExecutionResult,
  type RunnerMcpRuntimeDefinition,
} from '@mba-demo/runner'
import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Context } from 'hono'
import { createRunnerMcpServer } from '../mcp-server.js'

const MCP_REQUEST_BODY_LIMIT = 256 * 1024
const DEFAULT_MCP_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']

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
  allowedHosts?: string[]
  runner?: McpRunnerApi
}

export function createMcpRoute({
  allowedHosts = DEFAULT_MCP_ALLOWED_HOSTS,
  runner = defaultRunner,
}: McpRouteOptions = {}) {
  const route = createMcpHonoApp({
    allowedHosts,
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

export function parseMcpAllowedHosts(
  value: string | undefined,
  production = process.env.NODE_ENV === 'production',
): string[] {
  if (!value) {
    if (production) {
      throw new Error('MCP_ALLOWED_HOSTS is required in production')
    }
    return DEFAULT_MCP_ALLOWED_HOSTS
  }
  const hosts = [
    ...new Set(value.split(',').map((host) => host.trim())),
  ].filter(Boolean)
  if (
    hosts.length === 0 ||
    hosts.some(
      (host) =>
        !(/^\[[0-9a-f:]+\]$/i.test(host) || /^[a-z0-9.-]+$/i.test(host)),
    )
  ) {
    throw new Error(
      'MCP_ALLOWED_HOSTS must contain comma-separated hostnames without ports',
    )
  }
  return hosts
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
