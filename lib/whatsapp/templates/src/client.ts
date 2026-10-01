import {
  WhatsAppTemplatesApiError,
  WhatsAppTemplatesResponseError,
} from './errors.js'
import type {
  CreateLibraryTemplateInput,
  CreateTemplateGroupInput,
  CreateTemplateInput,
  CreateTemplateResponse,
  GetTemplateOptions,
  LibraryTemplate,
  ListTemplateLibraryOptions,
  ListTemplatesOptions,
  MigrateTemplatesInput,
  MigrateTemplatesResponse,
  Paging,
  RequestOptions,
  SuccessResponse,
  TemplateGroup,
  TemplateLibraryPage,
  TemplateNamespaceResponse,
  TemplatePage,
  TemplateCategory,
  TemplateStatus,
  UpdateTemplateGroupInput,
  UpdateTemplateInput,
  UpsertAuthenticationTemplatesInput,
  UpsertAuthenticationTemplatesResponse,
  WhatsAppTemplate,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppTemplatesClientOptions {
  accessToken: string
  wabaId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppTemplatesClientContract {
  create(
    input: CreateTemplateInput,
    options?: RequestOptions,
  ): Promise<CreateTemplateResponse>
  createFromLibrary(
    input: CreateLibraryTemplateInput,
    options?: RequestOptions,
  ): Promise<CreateTemplateResponse>
  list(options?: ListTemplatesOptions): Promise<TemplatePage>
  get(
    templateId: string,
    options?: GetTemplateOptions,
  ): Promise<WhatsAppTemplate>
  update(
    templateId: string,
    input: UpdateTemplateInput,
    options?: RequestOptions,
  ): Promise<SuccessResponse>
  deleteByName(name: string, options?: RequestOptions): Promise<SuccessResponse>
  deleteById(
    templateId: string,
    name: string,
    options?: RequestOptions,
  ): Promise<SuccessResponse>
  deleteByIds(
    templateIds: string[],
    options?: RequestOptions,
  ): Promise<SuccessResponse>
  getNamespace(options?: RequestOptions): Promise<TemplateNamespaceResponse>
  upsertAuthentication(
    input: UpsertAuthenticationTemplatesInput,
    options?: RequestOptions,
  ): Promise<UpsertAuthenticationTemplatesResponse>
  migrate(
    input: MigrateTemplatesInput,
    options?: RequestOptions,
  ): Promise<MigrateTemplatesResponse>
  listLibrary(
    options?: ListTemplateLibraryOptions,
  ): Promise<TemplateLibraryPage>
  createGroup(
    input: CreateTemplateGroupInput,
    options?: RequestOptions,
  ): Promise<{ id: string }>
  getGroup(
    groupId: string,
    options?: GetTemplateOptions,
  ): Promise<TemplateGroup>
  updateGroup(
    groupId: string,
    input: UpdateTemplateGroupInput,
    options?: RequestOptions,
  ): Promise<SuccessResponse>
  deleteGroup(
    groupId: string,
    options?: RequestOptions,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseStatus(value: unknown): TemplateStatus {
  const statuses: readonly string[] = [
    'APPROVED',
    'ARCHIVED',
    'DELETED',
    'DISABLED',
    'IN_APPEAL',
    'LIMIT_EXCEEDED',
    'PAUSED',
    'PENDING',
    'PENDING_DELETION',
    'REJECTED',
  ]
  if (typeof value !== 'string' || !statuses.includes(value)) {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned an unknown template status',
      value,
    )
  }
  return value as TemplateStatus
}

function parseCategory(value: unknown): TemplateCategory {
  if (
    value !== 'AUTHENTICATION' &&
    value !== 'FREE_SERVICE' &&
    value !== 'MARKETING' &&
    value !== 'UTILITY'
  ) {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned an unknown template category',
      value,
    )
  }
  return value
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

function parseSuccess(body: unknown): SuccessResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned an unexpected success response',
      body,
    )
  }
  return { success: true }
}

function parseId(body: unknown): { id: string } {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned an unexpected ID response',
      body,
    )
  }
  return { id: body.id }
}

function parseCreated(body: unknown): CreateTemplateResponse {
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    typeof body.category !== 'string'
  ) {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned an unexpected template creation response',
      body,
    )
  }
  return {
    id: body.id,
    status: parseStatus(body.status),
    category: parseCategory(body.category),
  }
}

function parseTemplate(body: unknown): WhatsAppTemplate {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned unexpected template data',
      body,
    )
  }
  return body as WhatsAppTemplate
}

function parsePaging(value: unknown): Paging | undefined {
  return isRecord(value) ? value : undefined
}

function parseTemplatePage(body: unknown): TemplatePage {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new WhatsAppTemplatesResponseError(
      'WhatsApp Graph API returned an unexpected template page',
      body,
    )
  }
  return {
    data: body.data.map(parseTemplate),
    paging: parsePaging(body.paging),
  }
}

function setListQuery(
  url: URL,
  options: {
    fields?: string[]
    limit?: number
    before?: string
    after?: string
  },
): void {
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

function validateTemplateName(name: string): string {
  const normalized = required('name', name)
  if (normalized.length > 512 || !/^[a-z0-9_]+$/.test(normalized)) {
    throw new TypeError(
      'name must contain only lowercase letters, numbers, and underscores and be at most 512 characters',
    )
  }
  return normalized
}

export class WhatsAppTemplatesClient implements WhatsAppTemplatesClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #version: string
  readonly #wabaId: string

  constructor(options: WhatsAppTemplatesClientOptions) {
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
    input: CreateTemplateInput,
    options: RequestOptions = {},
  ): Promise<CreateTemplateResponse> {
    return parseCreated(
      await this.#request(this.#wabaEdge('message_templates'), {
        method: 'POST',
        body: { ...input, name: validateTemplateName(input.name) },
        signal: options.signal,
      }),
    )
  }

  async createFromLibrary(
    input: CreateLibraryTemplateInput,
    options: RequestOptions = {},
  ): Promise<CreateTemplateResponse> {
    return parseCreated(
      await this.#request(this.#wabaEdge('message_templates'), {
        method: 'POST',
        body: { ...input, name: validateTemplateName(input.name) },
        signal: options.signal,
      }),
    )
  }

  async list(options: ListTemplatesOptions = {}): Promise<TemplatePage> {
    const url = this.#wabaEdge('message_templates')
    setListQuery(url, options)
    if (options.name) url.searchParams.set('name', options.name)
    if (options.language) url.searchParams.set('language', options.language)
    if (options.category) url.searchParams.set('category', options.category)
    if (options.status) url.searchParams.set('status', options.status)
    return parseTemplatePage(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async get(
    templateId: string,
    options: GetTemplateOptions = {},
  ): Promise<WhatsAppTemplate> {
    const url = this.#node(templateId, 'templateId')
    if (options.fields?.length) {
      url.searchParams.set('fields', options.fields.join(','))
    }
    return parseTemplate(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async update(
    templateId: string,
    input: UpdateTemplateInput,
    options: RequestOptions = {},
  ): Promise<SuccessResponse> {
    if (Object.keys(input).length === 0) {
      throw new TypeError('update must include at least one editable field')
    }
    return parseSuccess(
      await this.#request(this.#node(templateId, 'templateId'), {
        method: 'POST',
        body: input,
        signal: options.signal,
      }),
    )
  }

  deleteByName(name: string, options: RequestOptions = {}) {
    const url = this.#wabaEdge('message_templates')
    url.searchParams.set('name', required('name', name))
    return this.#deleteTemplates(url, options)
  }

  deleteById(templateId: string, name: string, options: RequestOptions = {}) {
    const url = this.#wabaEdge('message_templates')
    url.searchParams.set('hsm_id', required('templateId', templateId))
    url.searchParams.set('name', required('name', name))
    return this.#deleteTemplates(url, options)
  }

  deleteByIds(templateIds: string[], options: RequestOptions = {}) {
    if (templateIds.length === 0 || templateIds.length > 100) {
      throw new RangeError('templateIds must contain between 1 and 100 IDs')
    }
    const ids = templateIds.map((id) => required('templateId', id))
    const url = this.#wabaEdge('message_templates')
    url.searchParams.set('hsm_ids', JSON.stringify(ids))
    return this.#deleteTemplates(url, options)
  }

  async getNamespace(
    options: RequestOptions = {},
  ): Promise<TemplateNamespaceResponse> {
    const url = this.#node(this.#wabaId, 'wabaId')
    url.searchParams.set('fields', 'message_template_namespace')
    const body = await this.#request(url, {
      method: 'GET',
      signal: options.signal,
    })
    if (
      !isRecord(body) ||
      typeof body.id !== 'string' ||
      typeof body.message_template_namespace !== 'string'
    ) {
      throw new WhatsAppTemplatesResponseError(
        'WhatsApp Graph API returned an unexpected template namespace response',
        body,
      )
    }
    return {
      id: body.id,
      message_template_namespace: body.message_template_namespace,
    }
  }

  async upsertAuthentication(
    input: UpsertAuthenticationTemplatesInput,
    options: RequestOptions = {},
  ): Promise<UpsertAuthenticationTemplatesResponse> {
    if (input.languages.length === 0) {
      throw new RangeError('languages must contain at least one language')
    }
    const body = await this.#request(
      this.#wabaEdge('upsert_message_templates'),
      {
        method: 'POST',
        body: { ...input, name: validateTemplateName(input.name) },
        signal: options.signal,
      },
    )
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new WhatsAppTemplatesResponseError(
        'WhatsApp Graph API returned an unexpected authentication upsert response',
        body,
      )
    }
    return {
      data: body.data.map((item) => {
        if (
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          typeof item.language !== 'string'
        ) {
          throw new WhatsAppTemplatesResponseError(
            'WhatsApp Graph API returned an unexpected authentication template',
            item,
          )
        }
        return {
          id: item.id,
          language: item.language,
          status: parseStatus(item.status),
        }
      }),
    }
  }

  async migrate(
    input: MigrateTemplatesInput,
    options: RequestOptions = {},
  ): Promise<MigrateTemplatesResponse> {
    if (
      input.count !== undefined &&
      (!Number.isInteger(input.count) || input.count < 1 || input.count > 500)
    ) {
      throw new RangeError('count must be an integer between 1 and 500')
    }
    if (
      input.template_ids &&
      (input.template_ids.length === 0 || input.template_ids.length > 500)
    ) {
      throw new RangeError('template_ids must contain between 1 and 500 IDs')
    }
    const body = await this.#request(
      this.#wabaEdge('migrate_message_templates'),
      {
        method: 'POST',
        body: {
          ...input,
          source_waba_id: required('source_waba_id', input.source_waba_id),
        },
        signal: options.signal,
      },
    )
    if (
      !isRecord(body) ||
      !isStringArray(body.migrated_templates) ||
      !isRecord(body.failed_templates) ||
      !Object.values(body.failed_templates).every(
        (value) => typeof value === 'string',
      )
    ) {
      throw new WhatsAppTemplatesResponseError(
        'WhatsApp Graph API returned an unexpected migration response',
        body,
      )
    }
    return {
      migrated_templates: body.migrated_templates,
      failed_templates: body.failed_templates as Record<string, string>,
    }
  }

  async listLibrary(
    options: ListTemplateLibraryOptions = {},
  ): Promise<TemplateLibraryPage> {
    const url = this.#graphUrl('message_template_library')
    setListQuery(url, options)
    for (const key of [
      'search',
      'topic',
      'usecase',
      'industry',
      'language',
      'name',
    ] as const) {
      const value = options[key]
      if (value) url.searchParams.set(key, value)
    }
    const body = await this.#request(url, {
      method: 'GET',
      signal: options.signal,
    })
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new WhatsAppTemplatesResponseError(
        'WhatsApp Graph API returned an unexpected template library page',
        body,
      )
    }
    return {
      data: body.data.map((item) => {
        if (!isRecord(item) || typeof item.id !== 'string') {
          throw new WhatsAppTemplatesResponseError(
            'WhatsApp Graph API returned unexpected library template data',
            item,
          )
        }
        return item as LibraryTemplate
      }),
      paging: parsePaging(body.paging),
    }
  }

  async createGroup(
    input: CreateTemplateGroupInput,
    options: RequestOptions = {},
  ): Promise<{ id: string }> {
    return parseId(
      await this.#request(this.#wabaEdge('template_groups'), {
        method: 'POST',
        body: input,
        signal: options.signal,
      }),
    )
  }

  async getGroup(
    groupId: string,
    options: GetTemplateOptions = {},
  ): Promise<TemplateGroup> {
    const url = this.#node(groupId, 'groupId')
    if (options.fields?.length) {
      url.searchParams.set('fields', options.fields.join(','))
    }
    return this.#parseGroup(
      await this.#request(url, { method: 'GET', signal: options.signal }),
    )
  }

  async updateGroup(
    groupId: string,
    input: UpdateTemplateGroupInput,
    options: RequestOptions = {},
  ): Promise<SuccessResponse> {
    if (Object.keys(input).length === 0) {
      throw new TypeError('group update must include at least one field')
    }
    return parseSuccess(
      await this.#request(this.#node(groupId, 'groupId'), {
        method: 'POST',
        body: input,
        signal: options.signal,
      }),
    )
  }

  async deleteGroup(
    groupId: string,
    options: RequestOptions = {},
  ): Promise<SuccessResponse> {
    return parseSuccess(
      await this.#request(this.#node(groupId, 'groupId'), {
        method: 'DELETE',
        signal: options.signal,
      }),
    )
  }

  async #deleteTemplates(url: URL, options: RequestOptions) {
    return parseSuccess(
      await this.#request(url, {
        method: 'DELETE',
        signal: options.signal,
      }),
    )
  }

  #parseGroup(body: unknown): TemplateGroup {
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new WhatsAppTemplatesResponseError(
        'WhatsApp Graph API returned unexpected template group data',
        body,
      )
    }
    return body as TemplateGroup
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
      throw new WhatsAppTemplatesApiError(response.status, body)
    }
    return body
  }

  #wabaEdge(edge: string): URL {
    return this.#graphUrl(`${encodeURIComponent(this.#wabaId)}/${edge}`)
  }

  #node(id: string, name: string): URL {
    return this.#graphUrl(encodeURIComponent(required(name, id)))
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path}`, this.#baseUrl)
  }
}

export function createWhatsAppTemplatesClient(
  options: WhatsAppTemplatesClientOptions,
): WhatsAppTemplatesClient {
  return new WhatsAppTemplatesClient(options)
}
