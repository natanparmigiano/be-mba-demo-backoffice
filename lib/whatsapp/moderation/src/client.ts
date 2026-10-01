import {
  WhatsAppModerationApiError,
  WhatsAppModerationResponseError,
} from './errors.js'
import type {
  BlockedUser,
  BlockedUsersPage,
  BlockUsersResponse,
  FailedModeratedUser,
  ListBlockedUsersOptions,
  ModeratedUser,
  ModerationErrorData,
  ModerationPaging,
  ModerationPartialError,
  ModerationRequestOptions,
  ModerationUserError,
  UnblockUsersResponse,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'
const MAX_USERS_PER_REQUEST = 1_000

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppModerationClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppModerationClientContract {
  list(options?: ListBlockedUsersOptions): Promise<BlockedUsersPage>
  block(
    users: string[],
    options?: ModerationRequestOptions,
  ): Promise<BlockUsersResponse>
  unblock(
    users: string[],
    options?: ModerationRequestOptions,
  ): Promise<UnblockUsersResponse>
}

function required(name: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${name} must not be empty`)
  return normalized
}

function normalizeVersion(value: string): string {
  const version = required('graphApiVersion', value)
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new TypeError('graphApiVersion must use the form v26.0')
  }
  return version
}

function normalizeBaseUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('graphApiBaseUrl must use http or https')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/`
  return url
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = object[key]
  if (value !== undefined && typeof value !== 'string') {
    throw new WhatsAppModerationResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function optionalNumber(
  object: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = object[key]
  if (value !== undefined && typeof value !== 'number') {
    throw new WhatsAppModerationResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function optionalRecord(
  object: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = object[key]
  if (value !== undefined && !isRecord(value)) {
    throw new WhatsAppModerationResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function parsePaging(value: unknown): ModerationPaging | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid blocklist paging data',
      value,
    )
  }
  const cursors = optionalRecord(value, 'cursors')
  const before = cursors ? optionalString(cursors, 'before') : undefined
  const after = cursors ? optionalString(cursors, 'after') : undefined
  const previous = optionalString(value, 'previous')
  const next = optionalString(value, 'next')
  return {
    ...value,
    ...(cursors
      ? {
          cursors: {
            ...cursors,
            ...(before === undefined ? {} : { before }),
            ...(after === undefined ? {} : { after }),
          },
        }
      : {}),
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  }
}

function parseBlockedUser(value: unknown): BlockedUser {
  if (
    !isRecord(value) ||
    value.messaging_product !== 'whatsapp' ||
    typeof value.wa_id !== 'string'
  ) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid blocked-user data',
      value,
    )
  }
  return { ...value, messaging_product: 'whatsapp', wa_id: value.wa_id }
}

function parseBlockedUsersPage(body: unknown): BlockedUsersPage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned an unexpected blocked-users page',
      body,
    )
  }
  const paging = parsePaging(body.paging)
  return {
    ...body,
    data: body.data.map(parseBlockedUser),
    ...(paging === undefined ? {} : { paging }),
  }
}

function parseErrorData(value: unknown): ModerationErrorData | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid moderation error data',
      value,
    )
  }
  const details = optionalString(value, 'details')
  return {
    ...value,
    ...(details === undefined ? {} : { details }),
  }
}

function parseUserError(value: unknown): ModerationUserError {
  if (
    !isRecord(value) ||
    typeof value.message !== 'string' ||
    typeof value.code !== 'number'
  ) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid per-user moderation error data',
      value,
    )
  }
  const errorData = parseErrorData(value.error_data)
  return {
    ...value,
    message: value.message,
    code: value.code,
    ...(errorData === undefined ? {} : { error_data: errorData }),
  }
}

function parseModeratedUser(value: unknown): ModeratedUser {
  if (
    !isRecord(value) ||
    typeof value.input !== 'string' ||
    typeof value.wa_id !== 'string'
  ) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid moderated-user data',
      value,
    )
  }
  return { ...value, input: value.input, wa_id: value.wa_id }
}

function parseFailedUser(value: unknown): FailedModeratedUser {
  if (
    !isRecord(value) ||
    typeof value.input !== 'string' ||
    !Array.isArray(value.errors)
  ) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid failed-user data',
      value,
    )
  }
  const waId = optionalString(value, 'wa_id')
  return {
    ...value,
    input: value.input,
    errors: value.errors.map(parseUserError),
    ...(waId === undefined ? {} : { wa_id: waId }),
  }
}

function parsePartialError(value: unknown): ModerationPartialError | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || typeof value.message !== 'string') {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid partial-failure data',
      value,
    )
  }
  const type = optionalString(value, 'type')
  const code = optionalNumber(value, 'code')
  const subcode = optionalNumber(value, 'error_subcode')
  const errorData = parseErrorData(value.error_data)
  const traceId = optionalString(value, 'fbtrace_id')
  return {
    ...value,
    message: value.message,
    ...(type === undefined ? {} : { type }),
    ...(code === undefined ? {} : { code }),
    ...(subcode === undefined ? {} : { error_subcode: subcode }),
    ...(errorData === undefined ? {} : { error_data: errorData }),
    ...(traceId === undefined ? {} : { fbtrace_id: traceId }),
  }
}

function parseModerationResponse(
  body: unknown,
  resultKey: 'added_users',
): BlockUsersResponse
function parseModerationResponse(
  body: unknown,
  resultKey: 'removed_users',
): UnblockUsersResponse
function parseModerationResponse(
  body: unknown,
  resultKey: 'added_users' | 'removed_users',
): BlockUsersResponse | UnblockUsersResponse {
  if (
    !isRecord(body) ||
    body.messaging_product !== 'whatsapp' ||
    !isRecord(body.block_users) ||
    !Array.isArray(body.block_users[resultKey])
  ) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned an unexpected moderation response',
      body,
    )
  }
  const failedUsers = body.block_users.failed_users
  if (failedUsers !== undefined && !Array.isArray(failedUsers)) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid failed-user data',
      failedUsers,
    )
  }
  const results = body.block_users[resultKey].map(parseModeratedUser)
  const error = parsePartialError(body.error)
  const failures =
    failedUsers === undefined
      ? {}
      : { failed_users: failedUsers.map(parseFailedUser) }
  const common = {
    ...body,
    messaging_product: 'whatsapp' as const,
    ...(error === undefined ? {} : { error }),
  }
  if (resultKey === 'added_users') {
    return {
      ...common,
      block_users: {
        ...body.block_users,
        added_users: results,
        ...failures,
      },
    }
  }
  return {
    ...common,
    block_users: {
      ...body.block_users,
      removed_users: results,
      ...failures,
    },
  }
}

function normalizeUsers(users: string[]): Array<{ user: string }> {
  if (users.length === 0 || users.length > MAX_USERS_PER_REQUEST) {
    throw new RangeError(
      `users must contain between 1 and ${MAX_USERS_PER_REQUEST} phone numbers`,
    )
  }
  return users.map((user) => ({ user: required('user', user) }))
}

function setListQuery(url: URL, options: ListBlockedUsersOptions): void {
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new RangeError('limit must be a positive integer')
    }
    url.searchParams.set('limit', String(options.limit))
  }
  if (options.before) url.searchParams.set('before', options.before)
  if (options.after) url.searchParams.set('after', options.after)
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppModerationResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

export class WhatsAppModerationClient implements WhatsAppModerationClientContract {
  readonly #accessToken: string
  readonly #blockUsersUrl: URL
  readonly #fetch: Fetch

  constructor(options: WhatsAppModerationClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    const phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    const version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    const baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#blockUsersUrl = new URL(
      `${version}/${encodeURIComponent(phoneNumberId)}/block_users`,
      baseUrl,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async list(options: ListBlockedUsersOptions = {}): Promise<BlockedUsersPage> {
    const url = new URL(this.#blockUsersUrl)
    setListQuery(url, options)
    return parseBlockedUsersPage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async block(
    users: string[],
    options: ModerationRequestOptions = {},
  ): Promise<BlockUsersResponse> {
    const body = await this.#modify('POST', users, options)
    return parseModerationResponse(body, 'added_users')
  }

  async unblock(
    users: string[],
    options: ModerationRequestOptions = {},
  ): Promise<UnblockUsersResponse> {
    const body = await this.#modify('DELETE', users, options)
    return parseModerationResponse(body, 'removed_users')
  }

  #modify(
    method: 'DELETE' | 'POST',
    users: string[],
    options: ModerationRequestOptions,
  ): Promise<unknown> {
    return this.#request(this.#blockUsersUrl, {
      method,
      body: {
        messaging_product: 'whatsapp',
        block_users: normalizeUsers(users),
      },
      signal: options.signal,
    })
  }

  async #request(
    url: URL,
    request: {
      method: 'DELETE' | 'GET' | 'POST'
      body?: object
      signal?: AbortSignal
    },
  ): Promise<unknown> {
    const response = await this.#fetch(url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        ...(request.body ? { 'content-type': 'application/json' } : {}),
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: request.signal,
    })
    const body = parseJson(await response.text())
    if (!response.ok) {
      throw new WhatsAppModerationApiError(response.status, body)
    }
    return body
  }
}

export function createWhatsAppModerationClient(
  options: WhatsAppModerationClientOptions,
): WhatsAppModerationClient {
  return new WhatsAppModerationClient(options)
}
