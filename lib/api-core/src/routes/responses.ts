import { auth } from '@mba-desk/auth'
import { Hono } from 'hono'
import {
  extractTokenUsage,
  persistLlmAuditEntry,
  safelyPersistLlmAuditEntry,
  type LlmAuditEntry,
  type LlmAuditWriter,
  type LlmRequestIdentity,
} from '../llm-audit.js'

const REQUEST_HEADERS_TO_REMOVE = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
])
const RESPONSE_HEADERS_TO_REMOVE = new Set([
  'connection',
  'content-length',
  'set-cookie',
  'transfer-encoding',
])

export interface ResponsesRouteOptions {
  apiBaseUrl?: string
  apiKey?: string
  authorize?: (headers: Headers) => Promise<LlmRequestIdentity | undefined>
  audit?: LlmAuditWriter
  fetch?: typeof globalThis.fetch
}

export type ResponsesAuditEntry = LlmAuditEntry

export const createResponsesRoute = ({
  apiBaseUrl = process.env.RESPONSES_API_BASE_URL,
  apiKey = process.env.RESPONSES_API_KEY,
  authorize = defaultAuthorize,
  audit = persistLlmAuditEntry,
  fetch: fetchUpstream = globalThis.fetch,
}: ResponsesRouteOptions = {}) => {
  return new Hono().all('/*', async (c) => {
    const identity = await authorize(c.req.raw.headers)
    if (!identity) {
      return c.json(
        { error: { message: 'Unauthorized', type: 'auth_error' } },
        401,
      )
    }
    if (!apiBaseUrl || !apiKey) {
      return c.json(
        {
          error: {
            message: 'Responses provider is not configured',
            type: 'configuration_error',
          },
        },
        503,
      )
    }

    let target: URL
    let upstreamPath: string
    try {
      const base = new URL(ensureTrailingSlash(apiBaseUrl))
      if (base.protocol !== 'https:' && base.protocol !== 'http:')
        throw new Error()
      const requestPath = c.req.path
      const mountedPrefix = '/api/responses/v1/'
      upstreamPath = requestPath.startsWith(mountedPrefix)
        ? requestPath.slice(mountedPrefix.length)
        : requestPath.replace(/^\//, '')
      target = new URL(upstreamPath, base)
      target.search = new URL(c.req.url).search
    } catch {
      return c.json(
        {
          error: {
            message: 'Responses provider base URL is invalid',
            type: 'configuration_error',
          },
        },
        503,
      )
    }

    const headers = new Headers(c.req.raw.headers)
    for (const name of REQUEST_HEADERS_TO_REMOVE) headers.delete(name)
    headers.set('authorization', `Bearer ${apiKey}`)

    try {
      const method = c.req.method.toUpperCase()
      const requestedAt = new Date()
      const prepared = await createUpstreamBody(
        c.req.raw,
        upstreamPath,
        identity.safetyIdentifier,
      )
      const response = await fetchUpstream(target, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : prepared.body,
        // Node requires this for a streamed request body. It is harmless in other
        // fetch implementations and keeps large multimodal requests unbuffered.
        duplex: 'half',
      } as RequestInit)
      const responseHeaders = new Headers(response.headers)
      for (const name of RESPONSE_HEADERS_TO_REMOVE)
        responseHeaders.delete(name)
      responseHeaders.set('cache-control', 'no-store')
      const shouldAudit = method === 'POST' && upstreamPath === 'responses'
      const responseBody = shouldAudit
        ? createAuditedResponseBody(response, async (output) => {
            const completedAt = new Date()
            const usage = extractTokenUsage(output)
            await safelyPersistLlmAuditEntry(audit, {
              endpoint: 'responses',
              requestedAt,
              completedAt,
              durationMs: Math.max(
                0,
                completedAt.getTime() - requestedAt.getTime(),
              ),
              userId: identity.userId ?? identity.safetyIdentifier,
              organizationId: identity.organizationId ?? null,
              sessionId: identity.sessionId ?? null,
              authenticationState: { authenticated: true, method: 'session' },
              model: getString(prepared.auditInput, 'model'),
              streamed: getBoolean(prepared.auditInput, 'stream') ?? false,
              providerStatus: response.status,
              inputTokens: usage?.inputTokens ?? null,
              outputTokens: usage?.outputTokens ?? null,
              totalTokens: usage?.totalTokens ?? null,
              tokenUsage: usage?.raw ?? null,
              input: prepared.auditInput,
              output,
            })
          })
        : response.body
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    } catch {
      return c.json(
        {
          error: {
            message: 'Responses provider request failed',
            type: 'upstream_error',
          },
        },
        502,
      )
    }
  })
}

async function defaultAuthorize(headers: Headers) {
  const session = await auth.api.getSession({ headers })
  return session
    ? {
        safetyIdentifier: session.user.id,
        userId: session.user.id,
        organizationId: session.session.activeOrganizationId,
        sessionId: session.session.id,
      }
    : undefined
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

async function createUpstreamBody(
  request: Request,
  path: string,
  safetyIdentifier: string,
) {
  if (
    path !== 'responses' ||
    !request.headers.get('content-type')?.includes('application/json')
  ) {
    return { body: request.body, auditInput: null }
  }

  const payload = (await request.json()) as Record<string, unknown>
  return {
    body: JSON.stringify({ safety_identifier: safetyIdentifier, ...payload }),
    auditInput: payload,
  }
}

function createAuditedResponseBody(
  response: Response,
  onComplete: (output: unknown) => Promise<void>,
) {
  if (!response.body) {
    void onComplete(null)
    return null
  }

  const chunks: Uint8Array[] = []
  const contentType = response.headers.get('content-type') ?? ''
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      chunks.push(chunk.slice())
      controller.enqueue(chunk)
    },
    async flush() {
      const body = new TextDecoder().decode(concatenate(chunks))
      await onComplete(parseProviderOutput(body, contentType))
    },
  })
  return response.body.pipeThrough(transform)
}

function concatenate(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function parseProviderOutput(body: string, contentType: string): unknown {
  if (contentType.includes('text/event-stream')) {
    const events = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((data) => data && data !== '[DONE]')
      .map(parseJsonOrText)
    return events
  }
  return parseJsonOrText(body)
}

function parseJsonOrText(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function getString(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return null
  const result = (value as Record<string, unknown>)[key]
  return typeof result === 'string' ? result : null
}

function getBoolean(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const result = (value as Record<string, unknown>)[key]
  return typeof result === 'boolean' ? result : undefined
}
