import {
  WhatsAppSubscriptionsApiError,
  WhatsAppSubscriptionsResponseError,
} from './errors.js'
import type {
  OverrideCallbackInput,
  SubscriptionAppData,
  SubscriptionPage,
  SubscriptionPaging,
  SubscriptionRequestOptions,
  SuccessResponse,
  WhatsAppSubscription,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppSubscriptionsClientOptions {
  accessToken: string
  wabaId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppSubscriptionsClientContract {
  subscribe(options?: SubscriptionRequestOptions): Promise<SuccessResponse>
  list(options?: SubscriptionRequestOptions): Promise<SubscriptionPage>
  unsubscribe(options?: SubscriptionRequestOptions): Promise<SuccessResponse>
  overrideCallback(
    input: OverrideCallbackInput,
    options?: SubscriptionRequestOptions,
  ): Promise<SubscriptionPage>
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

function callbackUrl(value: string): string {
  const normalized = required('override_callback_uri', value)
  const url = new URL(normalized)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('override_callback_uri must use http or https')
  }
  return normalized
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
    throw new WhatsAppSubscriptionsResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function parseAppData(value: unknown): SubscriptionAppData {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned invalid subscription app data',
      value,
    )
  }
  const link = optionalString(value, 'link')
  const name = optionalString(value, 'name')
  return {
    ...value,
    id: value.id,
    ...(link === undefined ? {} : { link }),
    ...(name === undefined ? {} : { name }),
  }
}

function parseSubscription(value: unknown): WhatsAppSubscription {
  if (!isRecord(value)) {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned invalid subscription data',
      value,
    )
  }
  const overrideCallbackUri = optionalString(value, 'override_callback_uri')
  return {
    ...value,
    whatsapp_business_api_data: parseAppData(value.whatsapp_business_api_data),
    ...(overrideCallbackUri === undefined
      ? {}
      : { override_callback_uri: overrideCallbackUri }),
  }
}

function parsePaging(value: unknown): SubscriptionPaging | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned invalid subscription paging data',
      value,
    )
  }
  const cursors = value.cursors
  if (cursors !== undefined && !isRecord(cursors)) {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned invalid subscription cursors',
      value,
    )
  }
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

function parseSubscriptionPage(body: unknown): SubscriptionPage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned an unexpected subscription list',
      body,
    )
  }
  const paging = parsePaging(body.paging)
  return {
    ...body,
    data: body.data.map(parseSubscription),
    ...(paging === undefined ? {} : { paging }),
  }
}

function parseSuccess(body: unknown): SuccessResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned an unexpected success response',
      body,
    )
  }
  return { success: true }
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppSubscriptionsResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

function parseErrorBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export class WhatsAppSubscriptionsClient implements WhatsAppSubscriptionsClientContract {
  readonly #accessToken: string
  readonly #fetch: Fetch
  readonly #subscriptionsUrl: URL

  constructor(options: WhatsAppSubscriptionsClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    const wabaId = required('wabaId', options.wabaId)
    const version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    const baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#subscriptionsUrl = new URL(
      `${version}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      baseUrl,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async subscribe(
    options: SubscriptionRequestOptions = {},
  ): Promise<SuccessResponse> {
    return parseSuccess(
      await this.#request({ method: 'POST', signal: options.signal }),
    )
  }

  async list(
    options: SubscriptionRequestOptions = {},
  ): Promise<SubscriptionPage> {
    return parseSubscriptionPage(
      await this.#request({ method: 'GET', signal: options.signal }),
    )
  }

  async unsubscribe(
    options: SubscriptionRequestOptions = {},
  ): Promise<SuccessResponse> {
    return parseSuccess(
      await this.#request({ method: 'DELETE', signal: options.signal }),
    )
  }

  async overrideCallback(
    input: OverrideCallbackInput,
    options: SubscriptionRequestOptions = {},
  ): Promise<SubscriptionPage> {
    return parseSubscriptionPage(
      await this.#request({
        method: 'POST',
        body: {
          override_callback_uri: callbackUrl(input.override_callback_uri),
          verify_token: required('verify_token', input.verify_token),
        },
        signal: options.signal,
      }),
    )
  }

  async #request(request: {
    method: 'DELETE' | 'GET' | 'POST'
    body?: object
    signal?: AbortSignal
  }): Promise<unknown> {
    const response = await this.#fetch(this.#subscriptionsUrl, {
      method: request.method,
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        ...(request.body ? { 'content-type': 'application/json' } : {}),
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: request.signal,
    })
    const responseText = await response.text()
    if (!response.ok) {
      throw new WhatsAppSubscriptionsApiError(
        response.status,
        parseErrorBody(responseText),
      )
    }
    return parseJson(responseText)
  }
}

export function createWhatsAppSubscriptionsClient(
  options: WhatsAppSubscriptionsClientOptions,
): WhatsAppSubscriptionsClient {
  return new WhatsAppSubscriptionsClient(options)
}
