import { WhatsAppQrApiError, WhatsAppQrResponseError } from './errors.js'
import type {
  CreateQrCodeInput,
  ListQrCodesOptions,
  MessageQrCode,
  MessageQrCodeImage,
  QrCodeImageFormat,
  QrCodePage,
  QrPaging,
  QrRequestOptions,
  SuccessResponse,
  UpdateQrCodeInput,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppQrClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppQrClientContract {
  create(
    input: CreateQrCodeInput,
    options?: QrRequestOptions,
  ): Promise<MessageQrCode>
  get(code: string, options?: QrRequestOptions): Promise<MessageQrCode>
  getImageUrl(
    code: string,
    format: QrCodeImageFormat,
    options?: QrRequestOptions,
  ): Promise<MessageQrCodeImage>
  list(options?: ListQrCodesOptions): Promise<QrCodePage>
  update(
    code: string,
    input: UpdateQrCodeInput,
    options?: QrRequestOptions,
  ): Promise<MessageQrCode>
  delete(code: string, options?: QrRequestOptions): Promise<SuccessResponse>
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

function imageFormat(value: QrCodeImageFormat): QrCodeImageFormat {
  if (value !== 'PNG' && value !== 'SVG') {
    throw new TypeError('QR code image format must be PNG or SVG')
  }
  return value
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
    throw new WhatsAppQrResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function parseQrCode(value: unknown): MessageQrCode {
  if (!isRecord(value) || typeof value.code !== 'string' || !value.code) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned invalid QR code data',
      value,
    )
  }
  const prefilledMessage = optionalString(value, 'prefilled_message')
  const deepLinkUrl = optionalString(value, 'deep_link_url')
  const qrImageUrl = optionalString(value, 'qr_image_url')
  return {
    ...value,
    code: value.code,
    ...(prefilledMessage === undefined
      ? {}
      : { prefilled_message: prefilledMessage }),
    ...(deepLinkUrl === undefined ? {} : { deep_link_url: deepLinkUrl }),
    ...(qrImageUrl === undefined ? {} : { qr_image_url: qrImageUrl }),
  }
}

function parseQrCodeImage(value: unknown): MessageQrCodeImage {
  const qrCode = parseQrCode(value)
  if (typeof qrCode.qr_image_url !== 'string') {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned QR code data without an image URL',
      value,
    )
  }
  return { ...qrCode, qr_image_url: qrCode.qr_image_url }
}

function parsePaging(value: unknown): QrPaging | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned invalid QR code paging data',
      value,
    )
  }
  const cursors = value.cursors
  if (cursors !== undefined && !isRecord(cursors)) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned invalid QR code cursors',
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

function parseQrCodePage(body: unknown): QrCodePage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned an unexpected QR code page',
      body,
    )
  }
  const paging = parsePaging(body.paging)
  return {
    ...body,
    data: body.data.map(parseQrCode),
    ...(paging === undefined ? {} : { paging }),
  }
}

function parseSingleQrCode(body: unknown): MessageQrCode {
  const page = parseQrCodePage(body)
  const qrCode = page.data[0]
  if (!qrCode) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned an empty QR code result',
      body,
    )
  }
  return qrCode
}

function parseSingleQrCodeImage(body: unknown): MessageQrCodeImage {
  const page = parseQrCodePage(body)
  const qrCode = page.data[0]
  if (!qrCode) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned an empty QR code image result',
      body,
    )
  }
  return parseQrCodeImage(qrCode)
}

function parseSuccess(body: unknown): SuccessResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned an unexpected success response',
      body,
    )
  }
  return { success: true }
}

function setListQuery(url: URL, options: ListQrCodesOptions): void {
  const fields = options.fields?.map((field) => required('field', field)) ?? []
  if (options.imageFormat) {
    fields.push(`qr_image_url.format(${imageFormat(options.imageFormat)})`)
  }
  if (fields.length) {
    url.searchParams.set('fields', [...new Set(['code', ...fields])].join(','))
  }
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
    throw new WhatsAppQrResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

export class WhatsAppQrClient implements WhatsAppQrClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #qrCodesUrl: URL
  readonly #version: string

  constructor(options: WhatsAppQrClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    const phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    this.#version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#qrCodesUrl = this.#graphUrl(
      `${encodeURIComponent(phoneNumberId)}/message_qrdls`,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async create(
    input: CreateQrCodeInput,
    options: QrRequestOptions = {},
  ): Promise<MessageQrCode> {
    const body = {
      prefilled_message: required('prefilled_message', input.prefilled_message),
      ...(input.generate_qr_image === undefined
        ? {}
        : {
            generate_qr_image: imageFormat(
              input.generate_qr_image,
            ).toLowerCase(),
          }),
    }
    return parseQrCode(
      await this.#request(this.#qrCodesUrl, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: options.signal,
      }),
    )
  }

  async get(
    code: string,
    options: QrRequestOptions = {},
  ): Promise<MessageQrCode> {
    const url = new URL(
      `${this.#qrCodesUrl.href}/${encodeURIComponent(required('code', code))}`,
    )
    return parseSingleQrCode(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getImageUrl(
    code: string,
    format: QrCodeImageFormat,
    options: QrRequestOptions = {},
  ): Promise<MessageQrCodeImage> {
    const url = new URL(this.#qrCodesUrl)
    url.searchParams.set(
      'fields',
      `code,prefilled_message,deep_link_url,qr_image_url.format(${imageFormat(format)})`,
    )
    url.searchParams.set('code', required('code', code))
    return parseSingleQrCodeImage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async list(options: ListQrCodesOptions = {}): Promise<QrCodePage> {
    const url = new URL(this.#qrCodesUrl)
    setListQuery(url, options)
    return parseQrCodePage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async update(
    code: string,
    input: UpdateQrCodeInput,
    options: QrRequestOptions = {},
  ): Promise<MessageQrCode> {
    return parseQrCode(
      await this.#request(this.#qrCodesUrl, {
        method: 'POST',
        body: JSON.stringify({
          code: required('code', code),
          prefilled_message: required(
            'prefilled_message',
            input.prefilled_message,
          ),
        }),
        signal: options.signal,
      }),
    )
  }

  async delete(
    code: string,
    options: QrRequestOptions = {},
  ): Promise<SuccessResponse> {
    const url = new URL(
      `${this.#qrCodesUrl.href}/${encodeURIComponent(required('code', code))}`,
    )
    return parseSuccess(
      await this.#request(url, {
        method: 'DELETE',
        signal: options.signal,
      }),
    )
  }

  async #request(url: URL, init: RequestInit): Promise<unknown> {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${this.#accessToken}`)
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    const response = await this.#fetch(url, { ...init, headers })
    const body = parseJson(await response.text())
    if (!response.ok) throw new WhatsAppQrApiError(response.status, body)
    return body
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path}`, this.#baseUrl)
  }
}

export function createWhatsAppQrClient(
  options: WhatsAppQrClientOptions,
): WhatsAppQrClient {
  return new WhatsAppQrClient(options)
}
