import { WhatsAppWabaApiError, WhatsAppWabaResponseError } from './errors.js'
import type {
  ListWabasOptions,
  WabaPage,
  WabaPaging,
  WabaRequestOptions,
  WhatsAppBusinessAccount,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppWabaClientOptions {
  accessToken: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppWabaClientContract {
  get(
    wabaId: string,
    options?: WabaRequestOptions,
  ): Promise<WhatsAppBusinessAccount>
  listOwned(businessId: string, options?: ListWabasOptions): Promise<WabaPage>
  listShared(businessId: string, options?: ListWabasOptions): Promise<WabaPage>
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
    throw new WhatsAppWabaResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function graphId(value: unknown): string {
  if (typeof value === 'string' && value) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  throw new WhatsAppWabaResponseError(
    'WhatsApp Graph API returned an invalid WABA ID',
    value,
  )
}

function parseWaba(value: unknown): WhatsAppBusinessAccount {
  if (!isRecord(value)) {
    throw new WhatsAppWabaResponseError(
      'WhatsApp Graph API returned invalid WABA data',
      value,
    )
  }
  const name = optionalString(value, 'name')
  const currency = optionalString(value, 'currency')
  const timezoneId = optionalString(value, 'timezone_id')
  const namespace = optionalString(value, 'message_template_namespace')
  return {
    ...value,
    id: graphId(value.id),
    ...(name === undefined ? {} : { name }),
    ...(currency === undefined ? {} : { currency }),
    ...(timezoneId === undefined ? {} : { timezone_id: timezoneId }),
    ...(namespace === undefined
      ? {}
      : { message_template_namespace: namespace }),
  }
}

function parsePaging(value: unknown): WabaPaging | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new WhatsAppWabaResponseError(
      'WhatsApp Graph API returned invalid WABA paging data',
      value,
    )
  }
  const cursors = value.cursors
  if (cursors !== undefined && !isRecord(cursors)) {
    throw new WhatsAppWabaResponseError(
      'WhatsApp Graph API returned invalid WABA cursors',
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

function parseWabaPage(body: unknown): WabaPage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppWabaResponseError(
      'WhatsApp Graph API returned an unexpected WABA page',
      body,
    )
  }
  const paging = parsePaging(body.paging)
  return {
    ...body,
    data: body.data.map(parseWaba),
    ...(paging === undefined ? {} : { paging }),
  }
}

function setListQuery(url: URL, options: ListWabasOptions): void {
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
    throw new WhatsAppWabaResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

export class WhatsAppWabaClient implements WhatsAppWabaClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #version: string

  constructor(options: WhatsAppWabaClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    this.#version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async get(
    wabaId: string,
    options: WabaRequestOptions = {},
  ): Promise<WhatsAppBusinessAccount> {
    return parseWaba(
      await this.#request(this.#node(wabaId, 'wabaId'), options.signal),
    )
  }

  listOwned(
    businessId: string,
    options: ListWabasOptions = {},
  ): Promise<WabaPage> {
    return this.#list(businessId, 'owned_whatsapp_business_accounts', options)
  }

  listShared(
    businessId: string,
    options: ListWabasOptions = {},
  ): Promise<WabaPage> {
    return this.#list(businessId, 'client_whatsapp_business_accounts', options)
  }

  async #list(
    businessId: string,
    edge:
      'client_whatsapp_business_accounts' | 'owned_whatsapp_business_accounts',
    options: ListWabasOptions,
  ): Promise<WabaPage> {
    const url = this.#graphUrl(
      `${encodeURIComponent(required('businessId', businessId))}/${edge}`,
    )
    setListQuery(url, options)
    return parseWabaPage(await this.#request(url, options.signal))
  }

  async #request(url: URL, signal?: AbortSignal): Promise<unknown> {
    const response = await this.#fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.#accessToken}` },
      signal,
    })
    const body = parseJson(await response.text())
    if (!response.ok) throw new WhatsAppWabaApiError(response.status, body)
    return body
  }

  #node(id: string, name: string): URL {
    return this.#graphUrl(encodeURIComponent(required(name, id)))
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path}`, this.#baseUrl)
  }
}

export function createWhatsAppWabaClient(
  options: WhatsAppWabaClientOptions,
): WhatsAppWabaClient {
  return new WhatsAppWabaClient(options)
}
