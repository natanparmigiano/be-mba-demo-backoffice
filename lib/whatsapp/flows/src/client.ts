import { WhatsAppFlowsApiError, WhatsAppFlowsResponseError } from './errors.js'
import type {
  CreateFlowInput,
  CreateFlowResponse,
  EncryptionPublicKey,
  EncryptionPublicKeyResponse,
  FailedFlowMigration,
  FlowAsset,
  FlowAssetPage,
  FlowMetric,
  FlowMetricDataPoint,
  FlowMetricResponse,
  FlowPaging,
  FlowPage,
  FlowPreview,
  FlowPreviewResponse,
  FlowRequestOptions,
  FlowValidationError,
  GetFlowMetricOptions,
  GetFlowOptions,
  GetFlowPreviewOptions,
  ListFlowsOptions,
  MigrateFlowsInput,
  MigrateFlowsResponse,
  MigratedFlow,
  SetEncryptionPublicKeyInput,
  SuccessResponse,
  UpdateFlowMetadataInput,
  UploadFlowJsonInput,
  UploadFlowJsonResponse,
  WhatsAppFlow,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

const FLOW_CATEGORIES: ReadonlySet<string> = new Set([
  'APPOINTMENT_BOOKING',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'LEAD_GENERATION',
  'OTHER',
  'SIGN_IN',
  'SIGN_UP',
  'SURVEY',
])

const FLOW_METRIC_NAMES: ReadonlySet<string> = new Set([
  'ENDPOINT_AVAILABILITY',
  'ENDPOINT_REQUEST_COUNT',
  'ENDPOINT_REQUEST_ERROR',
  'ENDPOINT_REQUEST_ERROR_RATE',
  'ENDPOINT_REQUEST_LATENCY_SECONDS_CEIL',
])

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppFlowsClientOptions {
  accessToken: string
  wabaId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppFlowsClientContract {
  create(
    input: CreateFlowInput,
    options?: FlowRequestOptions,
  ): Promise<CreateFlowResponse>
  list(options?: ListFlowsOptions): Promise<FlowPage>
  get(flowId: string, options?: GetFlowOptions): Promise<WhatsAppFlow>
  getPreview(
    flowId: string,
    options?: GetFlowPreviewOptions,
  ): Promise<FlowPreviewResponse>
  migrate(
    input: MigrateFlowsInput,
    options?: FlowRequestOptions,
  ): Promise<MigrateFlowsResponse>
  updateMetadata(
    flowId: string,
    input: UpdateFlowMetadataInput,
    options?: FlowRequestOptions,
  ): Promise<SuccessResponse>
  uploadJson(
    flowId: string,
    input: UploadFlowJsonInput,
    options?: FlowRequestOptions,
  ): Promise<UploadFlowJsonResponse>
  listAssets(flowId: string, options?: ListFlowsOptions): Promise<FlowAssetPage>
  publish(
    flowId: string,
    options?: FlowRequestOptions,
  ): Promise<SuccessResponse>
  deprecate(
    flowId: string,
    options?: FlowRequestOptions,
  ): Promise<SuccessResponse>
  delete(flowId: string, options?: FlowRequestOptions): Promise<SuccessResponse>
  getMetric(
    flowId: string,
    options: GetFlowMetricOptions,
  ): Promise<FlowMetricResponse>
  getEncryptionPublicKey(
    phoneNumberId: string,
    options?: FlowRequestOptions,
  ): Promise<EncryptionPublicKeyResponse>
  setEncryptionPublicKey(
    phoneNumberId: string,
    input: SetEncryptionPublicKeyInput,
    options?: FlowRequestOptions,
  ): Promise<SuccessResponse>
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

function httpUrl(name: string, value: string): string {
  const normalized = required(name, value)
  const url = new URL(normalized)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`${name} must use http or https`)
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

function parseSuccess(body: unknown): SuccessResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected success response',
      body,
    )
  }
  return { success: true }
}

function parseCreated(body: unknown): CreateFlowResponse {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected flow creation response',
      body,
    )
  }
  return { id: body.id }
}

function parseValidationError(value: unknown): FlowValidationError {
  if (!isRecord(value)) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow validation data',
      value,
    )
  }
  return value
}

function parseFlow(body: unknown): WhatsAppFlow {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned unexpected Flow data',
      body,
    )
  }
  if (
    body.validation_errors !== undefined &&
    !Array.isArray(body.validation_errors)
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow validation errors',
      body,
    )
  }
  return {
    ...body,
    id: body.id,
    validation_errors: body.validation_errors?.map(parseValidationError),
  }
}

function parsePaging(value: unknown): FlowPaging | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid paging data',
      value,
    )
  }
  return value
}

function parseFlowPage(body: unknown): FlowPage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected Flow page',
      body,
    )
  }
  return {
    ...body,
    data: body.data.map(parseFlow),
    paging: parsePaging(body.paging),
  }
}

function parsePreview(value: unknown): FlowPreview {
  if (
    !isRecord(value) ||
    typeof value.preview_url !== 'string' ||
    (typeof value.expires_at !== 'string' &&
      typeof value.expires_at !== 'number')
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow preview data',
      value,
    )
  }
  return {
    ...value,
    preview_url: value.preview_url,
    expires_at: value.expires_at,
  }
}

function parsePreviewResponse(body: unknown): FlowPreviewResponse {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected Flow preview response',
      body,
    )
  }
  return { id: body.id, preview: parsePreview(body.preview) }
}

function parseMigratedFlow(value: unknown): MigratedFlow {
  if (
    !isRecord(value) ||
    typeof value.source_id !== 'string' ||
    typeof value.source_name !== 'string' ||
    typeof value.migrated_id !== 'string'
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid migrated Flow data',
      value,
    )
  }
  return value as MigratedFlow
}

function parseFailedMigration(value: unknown): FailedFlowMigration {
  if (
    !isRecord(value) ||
    typeof value.source_name !== 'string' ||
    (typeof value.error_code !== 'string' &&
      typeof value.error_code !== 'number') ||
    typeof value.error_message !== 'string'
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid failed Flow migration data',
      value,
    )
  }
  return value as FailedFlowMigration
}

function parseMigration(body: unknown): MigrateFlowsResponse {
  if (
    !isRecord(body) ||
    !Array.isArray(body.migrated_flows) ||
    !Array.isArray(body.failed_flows)
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected Flow migration response',
      body,
    )
  }
  return {
    migrated_flows: body.migrated_flows.map(parseMigratedFlow),
    failed_flows: body.failed_flows.map(parseFailedMigration),
  }
}

function parseUpload(body: unknown): UploadFlowJsonResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected Flow asset upload response',
      body,
    )
  }
  const validationErrors = body.validation_errors ?? []
  if (!Array.isArray(validationErrors)) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow validation errors',
      body,
    )
  }
  return {
    success: true,
    validation_errors: validationErrors.map(parseValidationError),
  }
}

function parseAsset(value: unknown): FlowAsset {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    value.asset_type !== 'FLOW_JSON' ||
    typeof value.download_url !== 'string'
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow asset data',
      value,
    )
  }
  return value as FlowAsset
}

function parseAssetPage(body: unknown): FlowAssetPage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected Flow asset page',
      body,
    )
  }
  return {
    ...body,
    data: body.data.map(parseAsset),
    paging: parsePaging(body.paging),
  }
}

function parseMetricDataPoint(value: unknown): FlowMetricDataPoint {
  if (
    !isRecord(value) ||
    typeof value.timestamp !== 'string' ||
    !Array.isArray(value.data) ||
    !value.data.every(
      (item) =>
        isRecord(item) &&
        typeof item.key === 'string' &&
        typeof item.value === 'number',
    )
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow metric data',
      value,
    )
  }
  return value as FlowMetricDataPoint
}

function parseMetric(body: unknown): FlowMetricResponse {
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    !isRecord(body.metric) ||
    typeof body.metric.name !== 'string' ||
    !FLOW_METRIC_NAMES.has(body.metric.name) ||
    (body.metric.granularity !== 'DAY' &&
      body.metric.granularity !== 'LIFETIME') ||
    !Array.isArray(body.metric.data_points)
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected Flow metric response',
      body,
    )
  }
  return {
    id: body.id,
    metric: {
      ...body.metric,
      name: body.metric.name as FlowMetric['name'],
      granularity: body.metric.granularity,
      data_points: body.metric.data_points.map(parseMetricDataPoint),
    },
  }
}

function parseEncryptionKey(value: unknown): EncryptionPublicKey {
  if (
    !isRecord(value) ||
    typeof value.business_public_key !== 'string' ||
    typeof value.business_public_key_signature_status !== 'string'
  ) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned invalid Flow encryption key data',
      value,
    )
  }
  return value as EncryptionPublicKey
}

function parseEncryptionKeys(body: unknown): EncryptionPublicKeyResponse {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppFlowsResponseError(
      'WhatsApp Graph API returned an unexpected encryption key response',
      body,
    )
  }
  return { data: body.data.map(parseEncryptionKey) }
}

function validateCategories(categories: string[]): void {
  if (
    categories.length === 0 ||
    categories.some((category) => !FLOW_CATEGORIES.has(category))
  ) {
    throw new TypeError(
      'categories must contain at least one valid Flow category',
    )
  }
}

function setPaging(url: URL, options: ListFlowsOptions): void {
  if (options.fields?.length)
    url.searchParams.set('fields', options.fields.join(','))
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new RangeError('limit must be a positive integer')
    }
    url.searchParams.set('limit', String(options.limit))
  }
  if (options.before) url.searchParams.set('before', options.before)
  if (options.after) url.searchParams.set('after', options.after)
}

function metricDate(name: string, value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError(`${name} is invalid`)
    return value.toISOString().slice(0, 10)
  }
  return required(name, value)
}

export class WhatsAppFlowsClient implements WhatsAppFlowsClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #version: string
  readonly #wabaId: string

  constructor(options: WhatsAppFlowsClientOptions) {
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

  async create(
    input: CreateFlowInput,
    options: FlowRequestOptions = {},
  ): Promise<CreateFlowResponse> {
    validateCategories(input.categories)
    const form = new FormData()
    form.append('name', required('name', input.name))
    form.append('categories', JSON.stringify(input.categories))
    if (input.clone_flow_id) {
      form.append(
        'clone_flow_id',
        required('clone_flow_id', input.clone_flow_id),
      )
    }
    if (input.endpoint_uri) {
      form.append('endpoint_uri', httpUrl('endpoint_uri', input.endpoint_uri))
    }
    return parseCreated(
      await this.#request(this.#wabaEdge('flows'), {
        method: 'POST',
        body: form,
        signal: options.signal,
      }),
    )
  }

  async list(options: ListFlowsOptions = {}): Promise<FlowPage> {
    const url = this.#wabaEdge('flows')
    setPaging(url, options)
    return parseFlowPage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async get(
    flowId: string,
    options: GetFlowOptions = {},
  ): Promise<WhatsAppFlow> {
    const url = this.#node(flowId, 'flowId')
    if (options.fields?.length) {
      url.searchParams.set('fields', options.fields.join(','))
    }
    return parseFlow(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getPreview(
    flowId: string,
    options: GetFlowPreviewOptions = {},
  ): Promise<FlowPreviewResponse> {
    const url = this.#node(flowId, 'flowId')
    url.searchParams.set(
      'fields',
      `preview.invalidate(${options.invalidate ?? false})`,
    )
    if (options.unixTimestamp) url.searchParams.set('date_format', 'U')
    return parsePreviewResponse(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async migrate(
    input: MigrateFlowsInput,
    options: FlowRequestOptions = {},
  ): Promise<MigrateFlowsResponse> {
    const form = new FormData()
    form.append(
      'source_waba_id',
      required('source_waba_id', input.source_waba_id),
    )
    if (input.source_flow_names) {
      if (input.source_flow_names.length === 0) {
        throw new RangeError(
          'source_flow_names must not be empty when supplied',
        )
      }
      form.append(
        'source_flow_names',
        JSON.stringify(
          input.source_flow_names.map((name) =>
            required('source_flow_name', name),
          ),
        ),
      )
    }
    return parseMigration(
      await this.#request(this.#wabaEdge('migrate_flows'), {
        method: 'POST',
        body: form,
        signal: options.signal,
      }),
    )
  }

  async updateMetadata(
    flowId: string,
    input: UpdateFlowMetadataInput,
    options: FlowRequestOptions = {},
  ): Promise<SuccessResponse> {
    if (Object.keys(input).length === 0) {
      throw new TypeError(
        'Flow metadata update must include at least one field',
      )
    }
    const form = new FormData()
    if (input.name !== undefined)
      form.append('name', required('name', input.name))
    if (input.categories !== undefined) {
      validateCategories(input.categories)
      form.append('categories', JSON.stringify(input.categories))
    }
    if (input.endpoint_uri !== undefined) {
      form.append('endpoint_uri', httpUrl('endpoint_uri', input.endpoint_uri))
    }
    return parseSuccess(
      await this.#request(this.#node(flowId, 'flowId'), {
        method: 'POST',
        body: form,
        signal: options.signal,
      }),
    )
  }

  async uploadJson(
    flowId: string,
    input: UploadFlowJsonInput,
    options: FlowRequestOptions = {},
  ): Promise<UploadFlowJsonResponse> {
    const form = new FormData()
    form.append('file', input.file, input.filename ?? 'flow.json')
    form.append('name', 'flow.json')
    form.append('asset_type', 'FLOW_JSON')
    return parseUpload(
      await this.#request(this.#flowEdge(flowId, 'assets'), {
        method: 'POST',
        body: form,
        signal: options.signal,
      }),
    )
  }

  async listAssets(
    flowId: string,
    options: ListFlowsOptions = {},
  ): Promise<FlowAssetPage> {
    const url = this.#flowEdge(flowId, 'assets')
    setPaging(url, options)
    return parseAssetPage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  publish(flowId: string, options: FlowRequestOptions = {}) {
    return this.#successEdge(flowId, 'publish', 'POST', options)
  }

  deprecate(flowId: string, options: FlowRequestOptions = {}) {
    return this.#successEdge(flowId, 'deprecate', 'POST', options)
  }

  delete(flowId: string, options: FlowRequestOptions = {}) {
    return this.#successEdge(flowId, undefined, 'DELETE', options)
  }

  async getMetric(
    flowId: string,
    options: GetFlowMetricOptions,
  ): Promise<FlowMetricResponse> {
    if (!FLOW_METRIC_NAMES.has(options.name)) {
      throw new TypeError('name must be a supported Flow endpoint metric')
    }
    if (options.granularity !== 'DAY' && options.granularity !== 'LIFETIME') {
      throw new TypeError('granularity must be DAY or LIFETIME')
    }
    const since = metricDate('since', options.since)
    const until = metricDate('until', options.until)
    const url = this.#node(flowId, 'flowId')
    url.searchParams.set(
      'fields',
      `metric.name(${options.name}).granularity(${options.granularity}).since(${since}).until(${until})`,
    )
    return parseMetric(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async getEncryptionPublicKey(
    phoneNumberId: string,
    options: FlowRequestOptions = {},
  ): Promise<EncryptionPublicKeyResponse> {
    return parseEncryptionKeys(
      await this.#request(this.#phoneEncryptionEdge(phoneNumberId), {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async setEncryptionPublicKey(
    phoneNumberId: string,
    input: SetEncryptionPublicKeyInput,
    options: FlowRequestOptions = {},
  ): Promise<SuccessResponse> {
    const form = new FormData()
    form.append(
      'business_public_key',
      required('business_public_key', input.business_public_key),
    )
    return parseSuccess(
      await this.#request(this.#phoneEncryptionEdge(phoneNumberId), {
        method: 'POST',
        body: form,
        signal: options.signal,
      }),
    )
  }

  async #successEdge(
    flowId: string,
    edge: string | undefined,
    method: 'DELETE' | 'POST',
    options: FlowRequestOptions,
  ): Promise<SuccessResponse> {
    const url = edge
      ? this.#flowEdge(flowId, edge)
      : this.#node(flowId, 'flowId')
    return parseSuccess(
      await this.#request(url, { method, signal: options.signal }),
    )
  }

  async #request(
    url: URL,
    request: {
      method: 'DELETE' | 'GET' | 'POST'
      body?: BodyInit
      signal?: AbortSignal
    },
  ): Promise<unknown> {
    const response = await this.#fetch(url, {
      method: request.method,
      headers: { authorization: `Bearer ${this.#accessToken}` },
      body: request.body,
      signal: request.signal,
    })
    const body = parseJson(await response.text())
    if (!response.ok) throw new WhatsAppFlowsApiError(response.status, body)
    return body
  }

  #wabaEdge(edge: string): URL {
    return this.#graphUrl(`${encodeURIComponent(this.#wabaId)}/${edge}`)
  }

  #node(id: string, name: string): URL {
    return this.#graphUrl(encodeURIComponent(required(name, id)))
  }

  #flowEdge(flowId: string, edge: string): URL {
    return this.#graphUrl(
      `${encodeURIComponent(required('flowId', flowId))}/${edge}`,
    )
  }

  #phoneEncryptionEdge(phoneNumberId: string): URL {
    return this.#graphUrl(
      `${encodeURIComponent(required('phoneNumberId', phoneNumberId))}/whatsapp_business_encryption`,
    )
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path}`, this.#baseUrl)
  }
}

export function createWhatsAppFlowsClient(
  options: WhatsAppFlowsClientOptions,
): WhatsAppFlowsClient {
  return new WhatsAppFlowsClient(options)
}
