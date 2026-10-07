import { EventEncoder } from '@ag-ui/encoder'
import { RunAgentInputSchema, type RunAgentInput } from '@ag-ui/core'
import { auth } from '@mba-desk/auth'
import {
  HashbrownOpenAI,
  type OpenAIHashbrownRunAgentInput,
} from '@hashbrownai/openai'
import { Hono, type Context } from 'hono'
import {
  extractTokenUsage,
  persistLlmAuditEntry,
  safelyPersistLlmAuditEntry,
  type LlmAuditWriter,
  type LlmRequestIdentity,
} from '../llm-audit.js'

export interface HashbrownRouteOptions {
  apiBaseUrl?: string
  apiKey?: string
  model?: string
  authorize?: (headers: Headers) => Promise<LlmRequestIdentity | undefined>
  audit?: LlmAuditWriter
  stream?: typeof HashbrownOpenAI.stream.text
}

export const createHashbrownRoute = ({
  apiBaseUrl = process.env.RESPONSES_API_BASE_URL,
  apiKey = process.env.RESPONSES_API_KEY,
  model = process.env.RESPONSES_MODEL,
  authorize = defaultAuthorize,
  audit = persistLlmAuditEntry,
  stream = HashbrownOpenAI.stream.text,
}: HashbrownRouteOptions = {}) =>
  new Hono().post('/', async (c) => {
    const identity = await authorize(c.req.raw.headers)
    if (!identity) {
      return c.json(
        { error: { message: 'Unauthorized', type: 'auth_error' } },
        401,
      )
    }
    if (!apiBaseUrl || !apiKey || !model) {
      return c.json(
        {
          error: {
            message: 'Hashbrown provider is not configured',
            type: 'configuration_error',
          },
        },
        503,
      )
    }

    let rawInput: unknown
    try {
      rawInput = await c.req.json()
    } catch {
      return invalidRequest(c)
    }
    const parsed = RunAgentInputSchema.safeParse(rawInput)
    if (!parsed.success) return invalidRequest(c)

    const input = withHashbrownOptions(parsed.data, rawInput)
    const requestedAt = new Date()
    const abortController = new AbortController()
    c.req.raw.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
    const encoder = new EventEncoder({ accept: c.req.header('accept') })
    const textEncoder = new TextEncoder()
    const events = stream({
      apiKey,
      baseURL: apiBaseUrl,
      model,
      input,
      signal: abortController.signal,
      transformRequestOptions: (options) => ({
        ...options,
        safety_identifier: identity.safetyIdentifier,
      }),
    })
    const output: unknown[] = []
    const persistAudit = async () => {
      const completedAt = new Date()
      const usage = extractTokenUsage(output)
      await safelyPersistLlmAuditEntry(audit, {
        endpoint: 'hashbrown',
        requestedAt,
        completedAt,
        durationMs: Math.max(0, completedAt.getTime() - requestedAt.getTime()),
        userId: identity.userId ?? identity.safetyIdentifier,
        organizationId: identity.organizationId ?? null,
        sessionId: identity.sessionId ?? null,
        authenticationState: { authenticated: true, method: 'session' },
        model,
        streamed: true,
        providerStatus: 200,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        tokenUsage: usage?.raw ?? null,
        input: rawInput,
        output,
      })
    }
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of events) {
            output.push(event)
            controller.enqueue(textEncoder.encode(encoder.encodeSSE(event)))
          }
          await persistAudit()
          controller.close()
        } catch (error) {
          await persistAudit()
          controller.error(error)
        }
      },
      cancel() {
        abortController.abort()
      },
    })

    return new Response(body, {
      headers: {
        'cache-control': 'no-cache, no-store, must-revalidate',
        'content-type': encoder.getContentType(),
      },
    })
  })

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

function invalidRequest(c: Context) {
  return c.json(
    { error: { message: 'Invalid AG-UI request', type: 'validation_error' } },
    400,
  )
}

function withHashbrownOptions(
  input: RunAgentInput,
  rawInput: unknown,
): OpenAIHashbrownRunAgentInput {
  if (!rawInput || typeof rawInput !== 'object' || !('hashbrown' in rawInput))
    return input
  const hashbrown = rawInput.hashbrown
  return hashbrown && typeof hashbrown === 'object'
    ? { ...input, hashbrown }
    : input
}
