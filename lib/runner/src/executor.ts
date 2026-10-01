import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Script } from 'node:vm'

export const DEFAULT_RUNNER_TIMEOUT_MS = 500
export const MAX_RUNNER_TIMEOUT_MS = 2_000
export const DEFAULT_RUNNER_MEMORY_LIMIT_MB = 8
export const MAX_RUNNER_FETCH_RESPONSE_BYTES = 1_048_576
export const MAX_RUNNER_FETCH_REQUEST_BYTES = 262_144

export interface IsolatedExecutionOptions {
  timeoutMs?: number
  memoryLimitMb?: number
}

export type IsolatedExecutionResult =
  | { status: 'succeeded'; result: unknown }
  | { status: 'failed' | 'timed_out'; errorMessage: string }

export interface RunnerExecutor {
  execute(
    code: string,
    parameters: Record<string, unknown>,
    options?: IsolatedExecutionOptions,
  ): Promise<IsolatedExecutionResult>
}

export interface IsolatedVmExecutorOptions {
  fetch?: typeof fetch
  fetchTimeoutMs?: number
}

interface IsolateFetchOptions {
  method?: unknown
  headers?: unknown
  body?: unknown
}

const isolateBootstrap = String.raw`
'use strict';
const deepFreeze = (value, seen = new Set()) => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
};
deepFreeze(parameters);
const hostFetch = $0;
globalThis.fetch = async (url, options = {}) => {
  const response = await hostFetch.apply(undefined, [url, options], {
    arguments: { copy: true },
    result: { promise: true, copy: true },
  });
  const headers = Object.freeze(response.headers);
  return Object.freeze({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers,
    text: async () => response.body,
    json: async () => JSON.parse(response.body),
  });
};
Object.freeze(globalThis.fetch);
`

export class IsolatedVmExecutor implements RunnerExecutor {
  readonly #fetch: typeof fetch
  readonly #fetchTimeoutMs: number

  constructor({
    fetch: request = globalThis.fetch,
    fetchTimeoutMs = DEFAULT_RUNNER_TIMEOUT_MS,
  }: IsolatedVmExecutorOptions = {}) {
    if (
      !Number.isInteger(fetchTimeoutMs) ||
      fetchTimeoutMs <= 0 ||
      fetchTimeoutMs > MAX_RUNNER_TIMEOUT_MS
    ) {
      throw new RangeError(
        `fetchTimeoutMs must be an integer between 1 and ${MAX_RUNNER_TIMEOUT_MS}`,
      )
    }
    this.#fetch = request
    this.#fetchTimeoutMs = fetchTimeoutMs
  }

  async execute(
    code: string,
    parameters: Record<string, unknown>,
    options: IsolatedExecutionOptions = {},
  ): Promise<IsolatedExecutionResult> {
    validateRunnerFunctionCode(code)
    const timeoutMs = options.timeoutMs ?? DEFAULT_RUNNER_TIMEOUT_MS
    const memoryLimitMb =
      options.memoryLimitMb ?? DEFAULT_RUNNER_MEMORY_LIMIT_MB
    assertLimits(timeoutMs, memoryLimitMb)
    const safeParameters = toJsonValue(parameters, 'Parameters') as Record<
      string,
      unknown
    >

    let catastrophicError: string | undefined
    const { default: ivm } = await import('isolated-vm')
    const isolate = new ivm.Isolate({
      memoryLimit: memoryLimitMb,
      inspector: false,
      onCatastrophicError: (message) => {
        catastrophicError = message
      },
    })
    const abortControllers = new Set<AbortController>()
    let wallTimer: NodeJS.Timeout | undefined
    try {
      const context = await isolate.createContext({ inspector: false })
      await context.global.set(
        'parameters',
        new ivm.ExternalCopy(safeParameters).copyInto(),
      )
      await context.evalClosure(isolateBootstrap, [
        new ivm.Reference((url: unknown, fetchOptions: unknown) =>
          this.#fetchHttps(url, fetchOptions, abortControllers),
        ),
      ])
      const script = await isolate.compileScript(
        `(async () => {\nconst runnerFunction = (${code});\nif (typeof runnerFunction !== 'function') throw new TypeError('Code must evaluate to a function');\nconst result = await runnerFunction(parameters);\nconst serialized = JSON.stringify(result === undefined ? null : result);\nif (serialized === undefined) throw new TypeError('Result must be JSON-serializable');\nreturn serialized;\n})()`,
        { filename: 'runner-function.js' },
      )
      const wallTimeout = new Promise<never>((_resolve, reject) => {
        wallTimer = setTimeout(() => {
          reject(new ExecutionWallTimeoutError(timeoutMs))
          for (const controller of abortControllers) controller.abort()
          if (!isolate.isDisposed) isolate.dispose()
        }, timeoutMs)
      })
      const resultJson: unknown = await Promise.race([
        script.run(context, {
          timeout: timeoutMs,
          promise: true,
          copy: true,
          release: true,
        }),
        wallTimeout,
      ])
      if (catastrophicError) throw new Error(catastrophicError)
      if (typeof resultJson !== 'string')
        throw new TypeError('Invalid isolated result')
      return {
        status: 'succeeded',
        result: JSON.parse(resultJson) as unknown,
      }
    } catch (error) {
      return {
        status: isTimeoutError(error) ? 'timed_out' : 'failed',
        errorMessage: truncateError(
          catastrophicError ??
            (error instanceof Error ? error.message : String(error)),
        ),
      }
    } finally {
      if (wallTimer) clearTimeout(wallTimer)
      for (const controller of abortControllers) controller.abort()
      if (!isolate.isDisposed) isolate.dispose()
    }
  }

  async #fetchHttps(
    rawUrl: unknown,
    rawOptions: unknown,
    abortControllers: Set<AbortController>,
  ) {
    let url = parseHttpsUrl(rawUrl)
    const options = parseFetchOptions(rawOptions)
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await assertPublicHostname(url.hostname)
      const controller = new AbortController()
      abortControllers.add(controller)
      const timeout = setTimeout(() => controller.abort(), this.#fetchTimeoutMs)
      let response: Response
      try {
        response = await this.#fetch(url, {
          ...options,
          redirect: 'manual',
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
        abortControllers.delete(controller)
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location || redirects === 3) {
          throw new Error('HTTPS fetch exceeded the redirect limit')
        }
        url = parseHttpsUrl(new URL(location, url).toString())
        continue
      }
      const body = await readBoundedBody(response)
      const headers: Record<string, string> = {}
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie' && name !== 'set-cookie2')
          headers[name] = value
      })
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url || url.toString(),
        headers,
        body,
      }
    }
    throw new Error('HTTPS fetch failed')
  }
}

export function validateRunnerFunctionCode(code: string): void {
  new Script(`"use strict"; (${code})`, { filename: 'runner-function.js' })
}

export function parseHttpsUrl(rawUrl: unknown): URL {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2_048) {
    throw new TypeError('fetch URL must be a string of at most 2048 characters')
  }
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') {
    throw new TypeError('Runner fetch only permits HTTPS URLs')
  }
  if (url.username || url.password) {
    throw new TypeError('Runner fetch URLs cannot contain credentials')
  }
  return url
}

function parseFetchOptions(rawOptions: unknown): RequestInit {
  if (rawOptions === undefined || rawOptions === null) return {}
  if (typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
    throw new TypeError('fetch options must be an object')
  }
  const value = rawOptions as IsolateFetchOptions
  if (value.method !== undefined && typeof value.method !== 'string') {
    throw new TypeError('fetch method must be a string')
  }
  const method = value.method?.toUpperCase() ?? 'GET'
  if (!['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'].includes(method)) {
    throw new TypeError('Unsupported HTTPS fetch method')
  }
  let headers: Record<string, string> | undefined
  if (value.headers !== undefined) {
    if (
      typeof value.headers !== 'object' ||
      value.headers === null ||
      Array.isArray(value.headers)
    ) {
      throw new TypeError('fetch headers must be an object')
    }
    headers = {}
    for (const [name, headerValue] of Object.entries(value.headers)) {
      const normalizedName = name.toLowerCase()
      if (
        [
          'connection',
          'content-length',
          'cookie',
          'host',
          'proxy-authorization',
        ].includes(normalizedName)
      ) {
        throw new TypeError(`Runner fetch forbids the ${name} header`)
      }
      if (typeof headerValue !== 'string') {
        throw new TypeError('fetch header values must be strings')
      }
      headers[name] = headerValue
    }
  }
  if (value.body !== undefined && typeof value.body !== 'string') {
    throw new TypeError('fetch body must be a string')
  }
  if (
    typeof value.body === 'string' &&
    Buffer.byteLength(value.body) > MAX_RUNNER_FETCH_REQUEST_BYTES
  ) {
    throw new RangeError('Runner fetch request body is too large')
  }
  if ((method === 'GET' || method === 'HEAD') && value.body !== undefined) {
    throw new TypeError(`${method} requests cannot have a body`)
  }
  return { method, headers, body: value.body }
}

async function assertPublicHostname(hostname: string): Promise<void> {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new TypeError('Runner fetch cannot access private hosts')
  }
  const literalVersion = isIP(hostname)
  const addresses = literalVersion
    ? [{ address: hostname, family: literalVersion }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new TypeError('Runner fetch cannot access private hosts')
  }
}

function isPrivateIp(address: string): boolean {
  if (address.includes(':')) {
    const normalized = address.toLowerCase()
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized)
    ) {
      return true
    }
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
    return mapped?.[1] ? isPrivateIp(mapped[1]) : false
  }
  const parts = address.split('.').map(Number)
  const [first, second] = parts
  if (parts.length !== 4 || first === undefined || second === undefined)
    return true
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RUNNER_FETCH_RESPONSE_BYTES
  ) {
    throw new RangeError('Runner fetch response is too large')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RUNNER_FETCH_RESPONSE_BYTES) {
        throw new RangeError('Runner fetch response is too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function assertLimits(timeoutMs: number, memoryLimitMb: number): void {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_RUNNER_TIMEOUT_MS
  ) {
    throw new RangeError(
      `timeoutMs must be an integer between 1 and ${MAX_RUNNER_TIMEOUT_MS}`,
    )
  }
  if (
    !Number.isInteger(memoryLimitMb) ||
    memoryLimitMb < 8 ||
    memoryLimitMb > 32
  ) {
    throw new RangeError('memoryLimitMb must be an integer between 8 and 32')
  }
}

function toJsonValue(value: unknown, label: string): unknown {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new TypeError(`${label} must be JSON-serializable`)
    }
    return JSON.parse(serialized) as unknown
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith(label)) {
      throw error
    }
    throw new TypeError(`${label} must be JSON-serializable`, { cause: error })
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof ExecutionWallTimeoutError ||
    (error instanceof Error && /timed out|timeout/i.test(error.message))
  )
}

function truncateError(message: string): string {
  return (message || 'Execution failed').slice(0, 4_000)
}

class ExecutionWallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Execution exceeded ${timeoutMs} ms`)
  }
}
