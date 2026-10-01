import {
  WhatsAppAnalyticsApiError,
  WhatsAppAnalyticsResponseError,
} from './errors.js'
import type {
  AnalyticsDate,
  AnalyticsRequestOptions,
  CallAnalyticsOptions,
  CallAnalyticsResponse,
  ConversationAnalyticsOptions,
  ConversationAnalyticsResponse,
  EnableTemplateAnalyticsResponse,
  GroupAnalyticsOptions,
  GroupAnalyticsResponse,
  MessagingAnalyticsOptions,
  MessagingAnalyticsResponse,
  PricingAnalyticsOptions,
  PricingAnalyticsResponse,
  TemplateAnalyticsOptions,
  TemplateAnalyticsResponse,
  TemplateGroupAnalyticsOptions,
  TemplateGroupAnalyticsResponse,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppAnalyticsClientOptions {
  accessToken: string
  wabaId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppAnalyticsClientContract {
  getMessagingAnalytics(
    options: MessagingAnalyticsOptions,
  ): Promise<MessagingAnalyticsResponse>
  getConversationAnalytics(
    options: ConversationAnalyticsOptions,
  ): Promise<ConversationAnalyticsResponse>
  getPricingAnalytics(
    options: PricingAnalyticsOptions,
  ): Promise<PricingAnalyticsResponse>
  getTemplateAnalytics(
    options: TemplateAnalyticsOptions,
  ): Promise<TemplateAnalyticsResponse>
  getTemplateGroupAnalytics(
    options: TemplateGroupAnalyticsOptions,
  ): Promise<TemplateGroupAnalyticsResponse>
  getCallAnalytics(
    options: CallAnalyticsOptions,
  ): Promise<CallAnalyticsResponse>
  getGroupAnalytics(
    options: GroupAnalyticsOptions,
  ): Promise<GroupAnalyticsResponse>
  enableTemplateAnalytics(
    options?: AnalyticsRequestOptions,
  ): Promise<EnableTemplateAnalyticsResponse>
}

type FieldFilterValue =
  boolean | number | string | readonly number[] | readonly string[]

interface FieldFilter {
  name: string
  value: FieldFilterValue | undefined
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

function assertUnixRange(start: number, end: number): void {
  for (const [name, value] of [
    ['start', start],
    ['end', end],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative UNIX timestamp`)
    }
  }
  if (end <= start) throw new RangeError('end must be greater than start')
}

function assertAnalyticsDate(name: string, value: AnalyticsDate): void {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative UNIX timestamp`)
    }
    return
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new TypeError(`${name} must be a UNIX timestamp or YYYY-MM-DD date`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`${name} must be a valid YYYY-MM-DD date`)
  }
}

function assertAnalyticsDateRange(
  start: AnalyticsDate,
  end: AnalyticsDate,
  useWabaTimezone: boolean | undefined,
): void {
  assertAnalyticsDate('start', start)
  assertAnalyticsDate('end', end)
  if (typeof start !== typeof end) {
    throw new TypeError('start and end must use the same date format')
  }
  if (
    (typeof start === 'number' && typeof end === 'number' && end <= start) ||
    (typeof start === 'string' && typeof end === 'string' && end <= start)
  ) {
    throw new RangeError('end must be greater than start')
  }
  if (
    useWabaTimezone === true &&
    (typeof start !== 'string' || typeof end !== 'string')
  ) {
    throw new TypeError(
      'start and end must use YYYY-MM-DD when useWabaTimezone is true',
    )
  }
}

function assertStringArray(
  name: string,
  values: readonly string[] | undefined,
  options: { max?: number; min?: number; pattern?: RegExp } = {},
): void {
  if (values === undefined) return
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`)
  if (values.length < (options.min ?? 0)) {
    throw new RangeError(`${name} must contain at least ${options.min} value`)
  }
  if (options.max !== undefined && values.length > options.max) {
    throw new RangeError(`${name} must contain at most ${options.max} values`)
  }
  for (const value of values) {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      (options.pattern && !options.pattern.test(value))
    ) {
      throw new TypeError(`${name} contains an invalid value`)
    }
  }
}

function assertNumberArray(
  name: string,
  values: readonly number[] | undefined,
): void {
  if (values === undefined) return
  if (
    !Array.isArray(values) ||
    values.some((value) => !Number.isSafeInteger(value))
  ) {
    throw new TypeError(`${name} must contain safe integers`)
  }
}

function assertAllowedValue(
  name: string,
  value: string,
  allowed: readonly string[],
): void {
  if (!allowed.includes(value)) {
    throw new TypeError(`${name} contains an unsupported value`)
  }
}

function assertAllowedStringArray(
  name: string,
  values: readonly string[] | undefined,
  allowed: readonly string[],
  options: { min?: number } = {},
): void {
  assertStringArray(name, values, options)
  for (const value of values ?? []) assertAllowedValue(name, value, allowed)
}

function formatFieldValue(value: FieldFilterValue): string {
  return Array.isArray(value) ? JSON.stringify(value) : String(value)
}

function fieldExpression(field: string, filters: readonly FieldFilter[]) {
  return filters.reduce(
    (expression, filter) =>
      filter.value === undefined
        ? expression
        : `${expression}.${filter.name}(${formatFieldValue(filter.value)})`,
    field,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertDataPoint(value: unknown, label: string): void {
  if (
    !isRecord(value) ||
    typeof value.start !== 'number' ||
    typeof value.end !== 'number'
  ) {
    throw new WhatsAppAnalyticsResponseError(
      `WhatsApp Graph API returned an invalid ${label} data point`,
      value,
    )
  }
}

function assertDataPoints(
  value: unknown,
  label: string,
): asserts value is Array<
  Record<string, unknown> & { start: number; end: number }
> {
  if (!Array.isArray(value)) {
    throw new WhatsAppAnalyticsResponseError(
      `WhatsApp Graph API returned invalid ${label} data points`,
      value,
    )
  }
  value.forEach((item) => assertDataPoint(item, label))
}

function parseMessagingResponse(body: unknown): MessagingAnalyticsResponse {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppAnalyticsResponseError(
      'WhatsApp Graph API returned an invalid messaging analytics response',
      body,
    )
  }
  const analytics = body.analytics
  if (
    !isRecord(analytics) ||
    !Array.isArray(analytics.phone_numbers) ||
    !Array.isArray(analytics.country_codes) ||
    typeof analytics.granularity !== 'string'
  ) {
    throw new WhatsAppAnalyticsResponseError(
      'WhatsApp Graph API returned invalid messaging analytics data',
      body,
    )
  }
  const dataPoints = analytics.data_points
  assertDataPoints(dataPoints, 'messaging analytics')
  for (const point of dataPoints) {
    if (
      !isRecord(point) ||
      typeof point.sent !== 'number' ||
      typeof point.delivered !== 'number'
    ) {
      throw new WhatsAppAnalyticsResponseError(
        'WhatsApp Graph API returned an invalid messaging analytics data point',
        point,
      )
    }
  }
  return body as unknown as MessagingAnalyticsResponse
}

function parseFieldSeriesResponse<Output>(
  body: unknown,
  field: 'conversation_analytics' | 'pricing_analytics',
): Output {
  if (!isRecord(body) || !isRecord(body[field])) {
    throw new WhatsAppAnalyticsResponseError(
      `WhatsApp Graph API returned an invalid ${field} response`,
      body,
    )
  }
  const data = body[field].data
  assertSeries(data, field)
  return body as Output
}

function parseCallResponse(body: unknown): CallAnalyticsResponse {
  if (!isRecord(body) || !isRecord(body.call_analytics)) {
    throw new WhatsAppAnalyticsResponseError(
      'WhatsApp Graph API returned an invalid call analytics response',
      body,
    )
  }
  const analytics = body.call_analytics
  if (typeof analytics.granularity !== 'string') {
    throw new WhatsAppAnalyticsResponseError(
      'WhatsApp Graph API returned invalid call analytics data',
      body,
    )
  }
  assertDataPoints(analytics.data_points, 'call analytics')
  return body as unknown as CallAnalyticsResponse
}

function assertSeries(
  value: unknown,
  label: string,
  identityKey?: string,
): void {
  if (!Array.isArray(value)) {
    throw new WhatsAppAnalyticsResponseError(
      `WhatsApp Graph API returned invalid ${label} series`,
      value,
    )
  }
  for (const series of value) {
    if (!isRecord(series)) {
      throw new WhatsAppAnalyticsResponseError(
        `WhatsApp Graph API returned an invalid ${label} series`,
        series,
      )
    }
    assertDataPoints(series.data_points, label)
    if (identityKey) {
      for (const point of series.data_points) {
        if (typeof point[identityKey] !== 'string') {
          throw new WhatsAppAnalyticsResponseError(
            `WhatsApp Graph API returned an invalid ${label} identifier`,
            point,
          )
        }
      }
    }
  }
}

function parsePage<Output>(
  body: unknown,
  label: string,
  identityKey: string,
): Output {
  if (!isRecord(body)) {
    throw new WhatsAppAnalyticsResponseError(
      `WhatsApp Graph API returned an invalid ${label} response`,
      body,
    )
  }
  assertSeries(body.data, label, identityKey)
  if (body.paging !== undefined && !isRecord(body.paging)) {
    throw new WhatsAppAnalyticsResponseError(
      `WhatsApp Graph API returned invalid ${label} paging data`,
      body,
    )
  }
  return body as Output
}

function parseEnabled(body: unknown): EnableTemplateAnalyticsResponse {
  if (
    !isRecord(body) ||
    (typeof body.id !== 'string' && typeof body.id !== 'number')
  ) {
    throw new WhatsAppAnalyticsResponseError(
      'WhatsApp Graph API returned an invalid template analytics enablement response',
      body,
    )
  }
  return { ...body, id: String(body.id) }
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppAnalyticsResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

export class WhatsAppAnalyticsClient implements WhatsAppAnalyticsClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #version: string
  readonly #wabaId: string

  constructor(options: WhatsAppAnalyticsClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    this.#wabaId = required('wabaId', options.wabaId)
    this.#version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async getMessagingAnalytics(
    options: MessagingAnalyticsOptions,
  ): Promise<MessagingAnalyticsResponse> {
    assertUnixRange(options.start, options.end)
    assertAllowedValue('granularity', options.granularity, [
      'HALF_HOUR',
      'DAY',
      'MONTH',
    ])
    assertStringArray('phoneNumbers', options.phoneNumbers)
    assertStringArray('countryCodes', options.countryCodes, {
      pattern: /^[A-Z]{2}$/,
    })
    assertNumberArray('productTypes', options.productTypes)
    if (
      options.productTypes?.some(
        (value) => value !== 0 && value !== 2 && value !== 100,
      )
    ) {
      throw new TypeError('productTypes contains an unsupported value')
    }
    const body = await this.#getField(
      fieldExpression('analytics', [
        { name: 'start', value: options.start },
        { name: 'end', value: options.end },
        { name: 'granularity', value: options.granularity },
        { name: 'phone_numbers', value: options.phoneNumbers },
        { name: 'product_types', value: options.productTypes },
        { name: 'country_codes', value: options.countryCodes },
      ]),
      options.signal,
    )
    return parseMessagingResponse(body)
  }

  async getConversationAnalytics(
    options: ConversationAnalyticsOptions,
  ): Promise<ConversationAnalyticsResponse> {
    assertUnixRange(options.start, options.end)
    this.#validateGranularity(options.granularity)
    this.#validateCommonFilters(options.phoneNumbers, options.countryCodes)
    assertAllowedStringArray('metricTypes', options.metricTypes, [
      'COST',
      'CONVERSATION',
    ])
    assertAllowedStringArray(
      'conversationCategories',
      options.conversationCategories,
      ['AUTHENTICATION', 'MARKETING', 'SERVICE', 'UTILITY'],
    )
    assertAllowedStringArray('conversationTypes', options.conversationTypes, [
      'FREE_ENTRY_POINT',
      'FREE_TIER',
      'REGULAR',
    ])
    assertAllowedStringArray(
      'conversationDirections',
      options.conversationDirections,
      ['BUSINESS_INITIATED', 'UNKNOWN', 'USER_INITIATED'],
    )
    assertAllowedStringArray('dimensions', options.dimensions, [
      'CONVERSATION_CATEGORY',
      'CONVERSATION_DIRECTION',
      'CONVERSATION_TYPE',
      'COUNTRY',
      'PHONE',
    ])
    const body = await this.#getField(
      fieldExpression('conversation_analytics', [
        { name: 'start', value: options.start },
        { name: 'end', value: options.end },
        { name: 'granularity', value: options.granularity },
        { name: 'phone_numbers', value: options.phoneNumbers },
        { name: 'country_codes', value: options.countryCodes },
        { name: 'metric_types', value: options.metricTypes },
        {
          name: 'conversation_categories',
          value: options.conversationCategories,
        },
        { name: 'conversation_types', value: options.conversationTypes },
        {
          name: 'conversation_directions',
          value: options.conversationDirections,
        },
        { name: 'dimensions', value: options.dimensions },
      ]),
      options.signal,
    )
    return parseFieldSeriesResponse<ConversationAnalyticsResponse>(
      body,
      'conversation_analytics',
    )
  }

  async getPricingAnalytics(
    options: PricingAnalyticsOptions,
  ): Promise<PricingAnalyticsResponse> {
    assertUnixRange(options.start, options.end)
    this.#validateGranularity(options.granularity)
    this.#validateCommonFilters(options.phoneNumbers, options.countryCodes)
    assertAllowedStringArray('metricTypes', options.metricTypes, [
      'COST',
      'VOLUME',
    ])
    assertAllowedStringArray('pricingTypes', options.pricingTypes, [
      'FREE_CUSTOMER_SERVICE',
      'FREE_ENTRY_POINT',
      'REGULAR',
    ])
    assertAllowedStringArray('pricingCategories', options.pricingCategories, [
      'AUTHENTICATION',
      'AUTHENTICATION_INTERNATIONAL',
      'MARKETING',
      'MARKETING_LITE',
      'REFERRAL_CONVERSION',
      'SERVICE',
      'UTILITY',
    ])
    assertAllowedStringArray('dimensions', options.dimensions, [
      'COUNTRY',
      'PHONE',
      'PRICING_CATEGORY',
      'PRICING_TYPE',
      'TIER',
    ])
    const body = await this.#getField(
      fieldExpression('pricing_analytics', [
        { name: 'start', value: options.start },
        { name: 'end', value: options.end },
        { name: 'granularity', value: options.granularity },
        { name: 'phone_numbers', value: options.phoneNumbers },
        { name: 'country_codes', value: options.countryCodes },
        { name: 'metric_types', value: options.metricTypes },
        { name: 'pricing_types', value: options.pricingTypes },
        { name: 'pricing_categories', value: options.pricingCategories },
        { name: 'dimensions', value: options.dimensions },
      ]),
      options.signal,
    )
    return parseFieldSeriesResponse<PricingAnalyticsResponse>(
      body,
      'pricing_analytics',
    )
  }

  async getTemplateAnalytics(
    options: TemplateAnalyticsOptions,
  ): Promise<TemplateAnalyticsResponse> {
    assertAnalyticsDateRange(
      options.start,
      options.end,
      options.useWabaTimezone,
    )
    assertStringArray('templateIds', options.templateIds, {
      min: 1,
      max: 10,
      pattern: /^\d+$/,
    })
    assertAllowedValue('granularity', options.granularity, ['DAILY'])
    assertAllowedStringArray('metricTypes', options.metricTypes, [
      'APP_ACTIVATIONS',
      'APP_ADD_TO_CART',
      'APP_CHECKOUTS_INITIATED',
      'APP_PURCHASES',
      'APP_PURCHASES_CONVERSION_VALUE',
      'CLICKED',
      'COST',
      'DELIVERED',
      'READ',
      'SENT',
      'WEBSITE_ADD_TO_CART',
      'WEBSITE_CHECKOUTS_INITIATED',
      'WEBSITE_PURCHASES',
      'WEBSITE_PURCHASES_CONVERSION_VALUE',
    ])
    if (options.productType !== undefined) {
      assertAllowedValue('productType', options.productType, [
        'CLOUD_API',
        'MARKETING_MESSAGES_API_FOR_WHATSAPP',
      ])
    }
    const url = this.#edgeUrl('template_analytics')
    this.#setDailyAnalyticsQuery(url, options)
    url.searchParams.set(
      'template_ids',
      serializeNumericIds(options.templateIds),
    )
    if (options.metricTypes !== undefined) {
      url.searchParams.set(
        'metric_types',
        options.metricTypes.map((value) => value.toLowerCase()).join(','),
      )
    }
    if (options.productType !== undefined) {
      url.searchParams.set('product_type', options.productType.toLowerCase())
    }
    return parsePage<TemplateAnalyticsResponse>(
      await this.#request(url, 'GET', options.signal),
      'template analytics',
      'template_id',
    )
  }

  async getTemplateGroupAnalytics(
    options: TemplateGroupAnalyticsOptions,
  ): Promise<TemplateGroupAnalyticsResponse> {
    assertAnalyticsDateRange(
      options.start,
      options.end,
      options.useWabaTimezone,
    )
    assertStringArray('templateGroupIds', options.templateGroupIds, {
      min: 1,
      max: 10,
      pattern: /^\d+$/,
    })
    assertAllowedValue('granularity', options.granularity, ['DAILY'])
    assertAllowedStringArray('metricTypes', options.metricTypes, [
      'CLICKED',
      'COST',
      'DELIVERED',
      'READ',
      'SENT',
    ])
    const url = this.#edgeUrl('template_group_analytics')
    this.#setDailyAnalyticsQuery(url, options)
    url.searchParams.set(
      'template_group_ids',
      serializeNumericIds(options.templateGroupIds),
    )
    if (options.metricTypes !== undefined) {
      url.searchParams.set(
        'metric_types',
        options.metricTypes.map((value) => value.toLowerCase()).join(','),
      )
    }
    return parsePage<TemplateGroupAnalyticsResponse>(
      await this.#request(url, 'GET', options.signal),
      'template group analytics',
      'template_group_id',
    )
  }

  async getCallAnalytics(
    options: CallAnalyticsOptions,
  ): Promise<CallAnalyticsResponse> {
    assertUnixRange(options.start, options.end)
    this.#validateGranularity(options.granularity)
    this.#validateCommonFilters(options.phoneNumbers, options.countryCodes)
    assertAllowedStringArray('directions', options.directions, [
      'BUSINESS_INITIATED',
      'USER_INITIATED',
    ])
    assertAllowedStringArray('dimensions', options.dimensions, [
      'COUNTRY',
      'DIRECTION',
      'PHONE',
    ])
    assertAllowedStringArray('metricTypes', options.metricTypes, [
      'AVERAGE_DURATION',
      'COST',
      'COUNT',
    ])
    const body = await this.#getField(
      fieldExpression('call_analytics', [
        { name: 'start', value: options.start },
        { name: 'end', value: options.end },
        { name: 'granularity', value: options.granularity },
        { name: 'phone_numbers', value: options.phoneNumbers },
        { name: 'country_codes', value: options.countryCodes },
        { name: 'directions', value: options.directions },
        { name: 'dimensions', value: options.dimensions },
        { name: 'metric_types', value: options.metricTypes },
      ]),
      options.signal,
    )
    return parseCallResponse(body)
  }

  async getGroupAnalytics(
    options: GroupAnalyticsOptions,
  ): Promise<GroupAnalyticsResponse> {
    assertUnixRange(options.start, options.end)
    assertStringArray('groupIds', options.groupIds, { min: 1, max: 1 })
    assertAllowedStringArray(
      'metricTypes',
      options.metricTypes,
      ['DELIVERED', 'PARTICIPANTS_JOINED', 'PARTICIPANTS_LEFT', 'READ', 'SENT'],
      { min: 1 },
    )
    assertAllowedValue('granularity', options.granularity ?? 'DAILY', ['DAILY'])
    const url = this.#edgeUrl('group_analytics')
    url.searchParams.set('start', String(options.start))
    url.searchParams.set('end', String(options.end))
    url.searchParams.set(
      'granularity',
      (options.granularity ?? 'DAILY').toLowerCase(),
    )
    url.searchParams.set('group_ids', JSON.stringify(options.groupIds))
    url.searchParams.set(
      'metric_types',
      JSON.stringify(options.metricTypes.map((value) => value.toUpperCase())),
    )
    return parsePage<GroupAnalyticsResponse>(
      await this.#request(url, 'GET', options.signal),
      'group analytics',
      'group_id',
    )
  }

  async enableTemplateAnalytics(
    options: AnalyticsRequestOptions = {},
  ): Promise<EnableTemplateAnalyticsResponse> {
    const url = this.#wabaUrl()
    url.searchParams.set('is_enabled_for_insights', 'true')
    return parseEnabled(await this.#request(url, 'POST', options.signal))
  }

  #validateCommonFilters(
    phoneNumbers: readonly string[] | undefined,
    countryCodes: readonly string[] | undefined,
  ): void {
    assertStringArray('phoneNumbers', phoneNumbers)
    assertStringArray('countryCodes', countryCodes, { pattern: /^[A-Z]{2}$/ })
  }

  #validateGranularity(granularity: string): void {
    assertAllowedValue('granularity', granularity, [
      'HALF_HOUR',
      'DAILY',
      'MONTHLY',
    ])
  }

  #setDailyAnalyticsQuery(
    url: URL,
    options: {
      start: AnalyticsDate
      end: AnalyticsDate
      granularity: 'DAILY'
      useWabaTimezone?: boolean
    },
  ): void {
    url.searchParams.set('start', String(options.start))
    url.searchParams.set('end', String(options.end))
    url.searchParams.set('granularity', options.granularity.toLowerCase())
    if (options.useWabaTimezone !== undefined) {
      url.searchParams.set('use_waba_timezone', String(options.useWabaTimezone))
    }
  }

  async #getField(field: string, signal: AbortSignal | undefined) {
    const url = this.#wabaUrl()
    url.searchParams.set('fields', field)
    return this.#request(url, 'GET', signal)
  }

  async #request(
    url: URL,
    method: 'GET' | 'POST',
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const response = await this.#fetch(url, {
      method,
      headers: { authorization: `Bearer ${this.#accessToken}` },
      signal,
    })
    const body = parseJson(await response.text())
    if (!response.ok) {
      throw new WhatsAppAnalyticsApiError(response.status, body)
    }
    return body
  }

  #wabaUrl(): URL {
    return new URL(
      `${this.#version}/${encodeURIComponent(this.#wabaId)}`,
      this.#baseUrl,
    )
  }

  #edgeUrl(edge: string): URL {
    return new URL(`${this.#wabaUrl().href}/${edge}`)
  }
}

function serializeNumericIds(ids: readonly string[]): string {
  return `[${ids.join(',')}]`
}

export function createWhatsAppAnalyticsClient(
  options: WhatsAppAnalyticsClientOptions,
): WhatsAppAnalyticsClient {
  return new WhatsAppAnalyticsClient(options)
}
