import {
  WhatsAppWebhookRegistrationApiError,
  WhatsAppWebhookRegistrationResponseError,
} from './registration-errors.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'
const WEBHOOK_OBJECT = 'whatsapp_business_account'

// This is the complete set of subscription fields currently accepted by the
// shared @mba-demo/wa-webhooks discriminated union. `messages` carries both
// messages and message status updates. Standby and echo traffic use their own
// fields and must be registered separately.
export const WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS = [
  'account_alerts',
  'account_review_update',
  'account_settings_update',
  'account_update',
  'automatic_events',
  'business_capability_update',
  'business_status_update',
  'calls',
  'flows',
  'group_lifecycle_update',
  'group_participants_update',
  'group_settings_update',
  'group_status_update',
  'history',
  'message_echoes',
  'messages',
  'messaging_handovers',
  'message_template_components_update',
  'message_template_quality_update',
  'message_template_status_update',
  'partner_solutions',
  'payment_configuration_update',
  'phone_number_name_update',
  'phone_number_quality_update',
  'security',
  'smb_app_state_sync',
  'smb_message_echoes',
  'standby',
  'template_category_update',
  'template_correct_category_detection',
  'tracking_events',
  'user_preferences',
] as const

export type WhatsAppWebhookSubscriptionField =
  (typeof WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS)[number]

export const MBA_WEBHOOK_SUBSCRIPTION_FIELDS = [
  'messages',
  'calls',
  'messaging_handovers',
  'account_settings_update',
  'standby',
  'business_status_update',
  'flows',
  'message_template_components_update',
  'message_template_quality_update',
  'message_template_status_update',
  'phone_number_quality_update',
  'phone_number_name_update',
  'template_category_update',
  'template_correct_category_detection',
] as const satisfies readonly WhatsAppWebhookSubscriptionField[]

const SUPPORTED_FIELDS: ReadonlySet<string> = new Set(
  WHATSAPP_WEBHOOK_SUBSCRIPTION_FIELDS,
)

export type WebhookRegistrationFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppWebhookRegistrationClientOptions {
  appId: string
  appSecret: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: WebhookRegistrationFetch
}

export interface RegisterWhatsAppWebhookInput {
  callbackUrl: string
  verifyToken: string
  fields: readonly WhatsAppWebhookSubscriptionField[]
}

export interface WhatsAppWebhookRegistrationResult {
  success: true
}

export interface WhatsAppWebhookSubscribedField {
  name: string
  version?: string
  [key: string]: unknown
}

export interface WhatsAppWebhookAppSubscription {
  object: string
  callback_url?: string
  active?: boolean
  fields: WhatsAppWebhookSubscribedField[]
  [key: string]: unknown
}

export interface WhatsAppWebhookAppSubscriptionPage {
  data: WhatsAppWebhookAppSubscription[]
  [key: string]: unknown
}

export interface WhatsAppWebhookRegistrationRequestOptions {
  signal?: AbortSignal
}

export interface WhatsAppWebhookRegistrationClientContract {
  register(
    input: RegisterWhatsAppWebhookInput,
    options?: WhatsAppWebhookRegistrationRequestOptions,
  ): Promise<WhatsAppWebhookRegistrationResult>
  list(
    options?: WhatsAppWebhookRegistrationRequestOptions,
  ): Promise<WhatsAppWebhookAppSubscriptionPage>
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
    throw new TypeError('graphApiBaseUrl must use HTTP or HTTPS')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/`
  return url
}

function normalizeCallbackUrl(value: string): string {
  const callbackUrl = required('callbackUrl', value)
  const url = new URL(callbackUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('callbackUrl must use HTTP or HTTPS')
  }
  return callbackUrl
}

function normalizeFields(
  fields: readonly WhatsAppWebhookSubscriptionField[],
): WhatsAppWebhookSubscriptionField[] {
  if (fields.length === 0) {
    throw new TypeError('fields must contain at least one webhook field')
  }
  const normalized = [...new Set(fields)]
  const unsupported = normalized.find((field) => !SUPPORTED_FIELDS.has(field))
  if (unsupported) {
    throw new TypeError(`Unsupported WhatsApp webhook field: ${unsupported}`)
  }
  return normalized
}

function rawFormValue(value: string): string {
  return encodeURIComponent(value)
    .replaceAll('%3A', ':')
    .replaceAll('%2F', '/')
    .replaceAll('%2C', ',')
    .replaceAll('%7C', '|')
}

function rawFormBody(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `${name}=${rawFormValue(value)}`)
    .join('&')
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppWebhookRegistrationResponseError(
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

function parseSuccess(body: unknown): WhatsAppWebhookRegistrationResult {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('success' in body) ||
    body.success !== true
  ) {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned an unexpected webhook registration response',
      body,
    )
  }
  return { success: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSubscribedField(value: unknown): WhatsAppWebhookSubscribedField {
  if (!isRecord(value) || typeof value.name !== 'string') {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned an invalid subscribed webhook field',
      value,
    )
  }
  if (value.version !== undefined && typeof value.version !== 'string') {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned an invalid webhook field version',
      value,
    )
  }
  return {
    ...value,
    name: value.name,
    ...(value.version === undefined ? {} : { version: value.version }),
  }
}

function parseSubscription(value: unknown): WhatsAppWebhookAppSubscription {
  if (
    !isRecord(value) ||
    typeof value.object !== 'string' ||
    !Array.isArray(value.fields)
  ) {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned invalid app webhook subscription data',
      value,
    )
  }
  if (
    value.callback_url !== undefined &&
    typeof value.callback_url !== 'string'
  ) {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned an invalid webhook callback URL',
      value,
    )
  }
  if (value.active !== undefined && typeof value.active !== 'boolean') {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned an invalid webhook subscription state',
      value,
    )
  }
  return {
    ...value,
    object: value.object,
    fields: value.fields.map(parseSubscribedField),
    ...(value.callback_url === undefined
      ? {}
      : { callback_url: value.callback_url }),
    ...(value.active === undefined ? {} : { active: value.active }),
  }
}

function parseSubscriptionPage(
  body: unknown,
): WhatsAppWebhookAppSubscriptionPage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppWebhookRegistrationResponseError(
      'WhatsApp Graph API returned an unexpected app subscription list',
      body,
    )
  }
  return { ...body, data: body.data.map(parseSubscription) }
}

export class WhatsAppWebhookRegistrationClient implements WhatsAppWebhookRegistrationClientContract {
  readonly #accessToken: string
  readonly #fetch: WebhookRegistrationFetch
  readonly #subscriptionsUrl: URL

  constructor(options: WhatsAppWebhookRegistrationClientOptions) {
    const appId = required('appId', options.appId)
    const appSecret = required('appSecret', options.appSecret)
    const version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    const baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#subscriptionsUrl = new URL(
      `${version}/${encodeURIComponent(appId)}/subscriptions`,
      baseUrl,
    )
    this.#accessToken = `${appId}|${appSecret}`
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async register(
    input: RegisterWhatsAppWebhookInput,
    options: WhatsAppWebhookRegistrationRequestOptions = {},
  ): Promise<WhatsAppWebhookRegistrationResult> {
    const body = rawFormBody({
      object: WEBHOOK_OBJECT,
      callback_url: normalizeCallbackUrl(input.callbackUrl),
      verify_token: required('verifyToken', input.verifyToken),
      fields: normalizeFields(input.fields).join(','),
      access_token: this.#accessToken,
    })
    const response = await this.#fetch(this.#subscriptionsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: options.signal,
    })
    const responseText = await response.text()
    if (!response.ok) {
      throw new WhatsAppWebhookRegistrationApiError(
        response.status,
        parseErrorBody(responseText),
      )
    }
    const responseBody = parseJson(responseText)
    return parseSuccess(responseBody)
  }

  async list(
    options: WhatsAppWebhookRegistrationRequestOptions = {},
  ): Promise<WhatsAppWebhookAppSubscriptionPage> {
    const url = new URL(this.#subscriptionsUrl)
    url.searchParams.set('access_token', this.#accessToken)
    const response = await this.#fetch(url, {
      method: 'GET',
      signal: options.signal,
    })
    const responseText = await response.text()
    if (!response.ok) {
      throw new WhatsAppWebhookRegistrationApiError(
        response.status,
        parseErrorBody(responseText),
      )
    }
    const responseBody = parseJson(responseText)
    return parseSubscriptionPage(responseBody)
  }
}

export function createWhatsAppWebhookRegistrationClient(
  options: WhatsAppWebhookRegistrationClientOptions,
): WhatsAppWebhookRegistrationClient {
  return new WhatsAppWebhookRegistrationClient(options)
}
