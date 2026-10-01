import {
  WhatsAppRegistrationApiError,
  WhatsAppRegistrationResponseError,
} from './errors.js'
import type {
  DataLocalizationRegion,
  GetPhoneNumberOptions,
  PhoneNumberInfo,
  RegisterPhoneNumberInput,
  RegistrationRequestOptions,
  RequestVerificationCodeInput,
  SetTwoStepVerificationPinInput,
  SuccessResponse,
  VerifyCodeInput,
  VerifyCodeResponse,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

const DATA_LOCALIZATION_REGIONS: ReadonlySet<string> = new Set([
  'AU',
  'BH',
  'BR',
  'CA',
  'CH',
  'DE',
  'GB',
  'ID',
  'IN',
  'JP',
  'KR',
  'SG',
  'ZA',
  'AE',
])

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppRegistrationClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppRegistrationClientContract {
  register(
    input: RegisterPhoneNumberInput,
    options?: RegistrationRequestOptions,
  ): Promise<SuccessResponse>
  deregister(options?: RegistrationRequestOptions): Promise<SuccessResponse>
  getPhoneNumber(options?: GetPhoneNumberOptions): Promise<PhoneNumberInfo>
  requestVerificationCode(
    input: RequestVerificationCodeInput,
    options?: RegistrationRequestOptions,
  ): Promise<SuccessResponse>
  verifyCode(
    input: VerifyCodeInput,
    options?: RegistrationRequestOptions,
  ): Promise<VerifyCodeResponse>
  setTwoStepVerificationPin(
    input: SetTwoStepVerificationPinInput,
    options?: RegistrationRequestOptions,
  ): Promise<SuccessResponse>
}

function required(name: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${name} must not be empty`)
  return normalized
}

function sixDigitCode(name: string, value: string): string {
  const normalized = required(name, value)
  if (!/^\d{6}$/.test(normalized)) {
    throw new TypeError(`${name} must contain exactly 6 digits`)
  }
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
    throw new WhatsAppRegistrationResponseError(
      `WhatsApp Graph API returned an invalid ${key}`,
      object,
    )
  }
  return value
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppRegistrationResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

function parseSuccess(body: unknown): SuccessResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppRegistrationResponseError(
      'WhatsApp Graph API returned an unexpected success response',
      body,
    )
  }
  return { success: true }
}

function parseVerifyCodeResponse(body: unknown): VerifyCodeResponse {
  const success = parseSuccess(body)
  if (!isRecord(body)) return success
  return { ...success, id: optionalString(body, 'id') }
}

function parsePhoneNumber(body: unknown): PhoneNumberInfo {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppRegistrationResponseError(
      'WhatsApp Graph API returned unexpected phone number data',
      body,
    )
  }
  return {
    ...body,
    id: body.id,
    display_phone_number: optionalString(body, 'display_phone_number'),
    verified_name: optionalString(body, 'verified_name'),
    quality_rating: optionalString(
      body,
      'quality_rating',
    ) as PhoneNumberInfo['quality_rating'],
    code_verification_status: optionalString(
      body,
      'code_verification_status',
    ) as PhoneNumberInfo['code_verification_status'],
    name_status: optionalString(
      body,
      'name_status',
    ) as PhoneNumberInfo['name_status'],
    status: optionalString(body, 'status'),
  }
}

function localizationRegion(value: DataLocalizationRegion): string {
  if (!DATA_LOCALIZATION_REGIONS.has(value)) {
    throw new TypeError('data_localization_region is not supported by WhatsApp')
  }
  return value
}

export class WhatsAppRegistrationClient implements WhatsAppRegistrationClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #phoneNumberUrl: URL
  readonly #version: string

  constructor(options: WhatsAppRegistrationClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    const phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    this.#version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#phoneNumberUrl = this.#graphUrl(encodeURIComponent(phoneNumberId))
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  register(
    input: RegisterPhoneNumberInput,
    options: RegistrationRequestOptions = {},
  ): Promise<SuccessResponse> {
    return this.#successRequest(
      'register',
      {
        messaging_product: 'whatsapp',
        pin: sixDigitCode('pin', input.pin),
        ...(input.data_localization_region
          ? {
              data_localization_region: localizationRegion(
                input.data_localization_region,
              ),
            }
          : {}),
      },
      options,
    )
  }

  deregister(
    options: RegistrationRequestOptions = {},
  ): Promise<SuccessResponse> {
    return this.#successRequest('deregister', undefined, options)
  }

  async getPhoneNumber(
    options: GetPhoneNumberOptions = {},
  ): Promise<PhoneNumberInfo> {
    const url = new URL(this.#phoneNumberUrl)
    if (options.fields?.length) {
      url.searchParams.set('fields', options.fields.join(','))
    }
    return parsePhoneNumber(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  requestVerificationCode(
    input: RequestVerificationCodeInput,
    options: RegistrationRequestOptions = {},
  ): Promise<SuccessResponse> {
    if (input.code_method !== 'SMS' && input.code_method !== 'VOICE') {
      throw new TypeError('code_method must be SMS or VOICE')
    }
    return this.#successRequest(
      'request_code',
      {
        code_method: input.code_method,
        language: required('language', input.language),
      },
      options,
    )
  }

  async verifyCode(
    input: VerifyCodeInput,
    options: RegistrationRequestOptions = {},
  ): Promise<VerifyCodeResponse> {
    return parseVerifyCodeResponse(
      await this.#request(this.#edge('verify_code'), {
        method: 'POST',
        body: { code: sixDigitCode('code', input.code) },
        signal: options.signal,
      }),
    )
  }

  setTwoStepVerificationPin(
    input: SetTwoStepVerificationPinInput,
    options: RegistrationRequestOptions = {},
  ): Promise<SuccessResponse> {
    return this.#successRequest(
      undefined,
      { pin: sixDigitCode('pin', input.pin) },
      options,
    )
  }

  async #successRequest(
    edge: string | undefined,
    body: object | undefined,
    options: RegistrationRequestOptions,
  ): Promise<SuccessResponse> {
    return parseSuccess(
      await this.#request(edge ? this.#edge(edge) : this.#phoneNumberUrl, {
        method: 'POST',
        body,
        signal: options.signal,
      }),
    )
  }

  async #request(
    url: URL,
    request: { method: 'GET' | 'POST'; body?: object; signal?: AbortSignal },
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
      throw new WhatsAppRegistrationApiError(response.status, body)
    }
    return body
  }

  #edge(edge: string): URL {
    return new URL(
      `${this.#phoneNumberUrl.pathname}/${edge}`,
      this.#phoneNumberUrl,
    )
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path}`, this.#baseUrl)
  }
}

export function createWhatsAppRegistrationClient(
  options: WhatsAppRegistrationClientOptions,
): WhatsAppRegistrationClient {
  return new WhatsAppRegistrationClient(options)
}
