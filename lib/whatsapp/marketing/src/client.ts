import {
  WhatsAppMarketingApiError,
  WhatsAppMarketingResponseError,
} from './errors.js'
import type {
  MarketingMessageRequest,
  MarketingMessageRequestOptions,
  SendMarketingMessageInput,
  SendMarketingMessageResponse,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppMarketingClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppMarketingClientContract {
  send(
    input: SendMarketingMessageInput,
    options?: MarketingMessageRequestOptions,
  ): Promise<SendMarketingMessageResponse>
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

function assertInput(input: SendMarketingMessageInput): void {
  required('to', input.to)
  required('template.name', input.template.name)
  required('template.language.code', input.template.language.code)
  if (
    input.product_policy !== undefined &&
    input.product_policy !== 'CLOUD_API_FALLBACK' &&
    input.product_policy !== 'STRICT'
  ) {
    throw new TypeError('product_policy contains an unsupported value')
  }
  const multiplier = input.bid_spec?.per_message_bid_multiplier
  if (
    multiplier !== undefined &&
    (!Number.isFinite(multiplier) || multiplier <= 0)
  ) {
    throw new RangeError('per_message_bid_multiplier must be a positive number')
  }
}

function parseResponse(body: unknown): SendMarketingMessageResponse {
  if (
    !isRecord(body) ||
    body.messaging_product !== 'whatsapp' ||
    !Array.isArray(body.contacts) ||
    !Array.isArray(body.messages) ||
    body.messages.some(
      (message) => !isRecord(message) || typeof message.id !== 'string',
    )
  ) {
    throw new WhatsAppMarketingResponseError(
      'WhatsApp returned an invalid marketing message response',
      body,
    )
  }
  return body as unknown as SendMarketingMessageResponse
}

export class WhatsAppMarketingClient implements WhatsAppMarketingClientContract {
  readonly #accessToken: string
  readonly #phoneNumberId: string
  readonly #graphApiVersion: string
  readonly #graphApiBaseUrl: URL
  readonly #fetch: Fetch

  constructor(options: WhatsAppMarketingClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    this.#phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    this.#graphApiVersion = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#graphApiBaseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async send(
    input: SendMarketingMessageInput,
    options: MarketingMessageRequestOptions = {},
  ): Promise<SendMarketingMessageResponse> {
    assertInput(input)
    const url = new URL(
      `${this.#graphApiVersion}/${encodeURIComponent(this.#phoneNumberId)}/marketing_messages`,
      this.#graphApiBaseUrl,
    )
    const payload: MarketingMessageRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to.trim(),
      type: 'template',
      template: input.template,
      ...(input.product_policy === undefined
        ? {}
        : { product_policy: input.product_policy }),
      ...(input.message_activity_sharing === undefined
        ? {}
        : { message_activity_sharing: input.message_activity_sharing }),
      ...(input.bid_spec === undefined ? {} : { bid_spec: input.bid_spec }),
    }
    const response = await this.#fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    })
    const text = await response.text()
    let body: unknown = text
    if (text) {
      try {
        body = JSON.parse(text)
      } catch (error) {
        if (response.ok) {
          throw new WhatsAppMarketingResponseError(
            'WhatsApp returned a non-JSON marketing message response',
            text,
            { cause: error },
          )
        }
      }
    }
    if (!response.ok) throw new WhatsAppMarketingApiError(response.status, body)
    return parseResponse(body)
  }
}

export function createWhatsAppMarketingClient(
  options: WhatsAppMarketingClientOptions,
): WhatsAppMarketingClientContract {
  return new WhatsAppMarketingClient(options)
}
