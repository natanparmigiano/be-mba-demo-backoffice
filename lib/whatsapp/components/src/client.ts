import {
  WhatsAppComponentsApiError,
  WhatsAppComponentsResponseError,
} from './errors.js'
import type {
  ComponentsRequestOptions,
  ConversationalCommand,
  ConversationalComponents,
  SuccessResponse,
  WriteConversationalComponentsInput,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'
const MAX_COMMANDS = 30
const MAX_COMMAND_NAME_LENGTH = 32
const MAX_COMMAND_DESCRIPTION_LENGTH = 256
const MAX_PROMPTS = 4
const MAX_PROMPT_LENGTH = 80

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppComponentsClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppComponentsClientContract {
  getConfiguration(
    options?: ComponentsRequestOptions,
  ): Promise<ConversationalComponents>
  setConfiguration(
    input: WriteConversationalComponentsInput,
    options?: ComponentsRequestOptions,
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

function normalizeCommand(
  command: ConversationalCommand,
  index: number,
): ConversationalCommand {
  if (!isRecord(command)) {
    throw new TypeError(`commands[${index}] must be an object`)
  }
  const commandName = required(
    `commands[${index}].command_name`,
    command.command_name,
  )
  const commandDescription = required(
    `commands[${index}].command_description`,
    command.command_description,
  )
  if (commandName.length > MAX_COMMAND_NAME_LENGTH) {
    throw new RangeError(
      `commands[${index}].command_name must not exceed ${MAX_COMMAND_NAME_LENGTH} characters`,
    )
  }
  if (commandDescription.length > MAX_COMMAND_DESCRIPTION_LENGTH) {
    throw new RangeError(
      `commands[${index}].command_description must not exceed ${MAX_COMMAND_DESCRIPTION_LENGTH} characters`,
    )
  }
  return {
    ...command,
    command_name: commandName,
    command_description: commandDescription,
  }
}

function normalizeInput(
  input: WriteConversationalComponentsInput,
): WriteConversationalComponentsInput {
  const hasCommands = input.commands !== undefined
  const hasPrompts = input.prompts !== undefined
  if (!hasCommands && !hasPrompts) {
    throw new TypeError('components input must include at least one field')
  }
  if (input.commands && input.commands.length > MAX_COMMANDS) {
    throw new RangeError(
      `commands must not contain more than ${MAX_COMMANDS} items`,
    )
  }
  if (input.prompts && input.prompts.length > MAX_PROMPTS) {
    throw new RangeError(
      `prompts must not contain more than ${MAX_PROMPTS} items`,
    )
  }
  const commands = input.commands?.map(normalizeCommand)
  const prompts = input.prompts?.map((prompt, index) => {
    const normalized = required(`prompts[${index}]`, prompt)
    if (normalized.length > MAX_PROMPT_LENGTH) {
      throw new RangeError(
        `prompts[${index}] must not exceed ${MAX_PROMPT_LENGTH} characters`,
      )
    }
    return normalized
  })
  return {
    ...(commands === undefined ? {} : { commands }),
    ...(prompts === undefined ? {} : { prompts }),
  }
}

function parseCommand(value: unknown, index: number): ConversationalCommand {
  if (!isRecord(value)) {
    throw new WhatsAppComponentsResponseError(
      `WhatsApp Graph API returned an invalid command at index ${index}`,
      value,
    )
  }
  const name = value.command_name
  const description = value.command_description
  if (typeof name !== 'string' || typeof description !== 'string') {
    throw new WhatsAppComponentsResponseError(
      `WhatsApp Graph API returned an invalid command at index ${index}`,
      value,
    )
  }
  return { ...value, command_name: name, command_description: description }
}

function parseComponents(body: unknown): ConversationalComponents {
  const value = isRecord(body) ? body.conversational_automation : undefined
  if (!isRecord(value)) {
    throw new WhatsAppComponentsResponseError(
      'WhatsApp Graph API returned invalid conversational components',
      body,
    )
  }
  if (value.commands !== undefined && !Array.isArray(value.commands)) {
    throw new WhatsAppComponentsResponseError(
      'WhatsApp Graph API returned invalid commands',
      body,
    )
  }
  if (value.prompts !== undefined && !Array.isArray(value.prompts)) {
    throw new WhatsAppComponentsResponseError(
      'WhatsApp Graph API returned invalid prompts',
      body,
    )
  }
  const commands = value.commands?.map(parseCommand)
  const prompts = value.prompts?.map((prompt, index) => {
    if (typeof prompt !== 'string') {
      throw new WhatsAppComponentsResponseError(
        `WhatsApp Graph API returned an invalid prompt at index ${index}`,
        body,
      )
    }
    return prompt
  })
  return {
    ...value,
    ...(commands === undefined ? {} : { commands }),
    ...(prompts === undefined ? {} : { prompts }),
  }
}

function parseSuccess(body: unknown): SuccessResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppComponentsResponseError(
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
    throw new WhatsAppComponentsResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

export class WhatsAppComponentsClient implements WhatsAppComponentsClientContract {
  readonly #accessToken: string
  readonly #phoneNumberUrl: URL
  readonly #componentsUrl: URL
  readonly #fetch: Fetch

  constructor(options: WhatsAppComponentsClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    const phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    const version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    const baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#phoneNumberUrl = new URL(
      `${version}/${encodeURIComponent(phoneNumberId)}`,
      baseUrl,
    )
    this.#componentsUrl = new URL(
      `${this.#phoneNumberUrl.href}/conversational_automation`,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async getConfiguration(
    options: ComponentsRequestOptions = {},
  ): Promise<ConversationalComponents> {
    const url = new URL(this.#phoneNumberUrl)
    url.searchParams.set('fields', 'conversational_automation')
    return parseComponents(
      await this.#request(url, {
        method: 'GET',
        signal: options.signal,
      }),
    )
  }

  async setConfiguration(
    input: WriteConversationalComponentsInput,
    options: ComponentsRequestOptions = {},
  ): Promise<SuccessResponse> {
    return parseSuccess(
      await this.#request(this.#componentsUrl, {
        method: 'POST',
        body: JSON.stringify(normalizeInput(input)),
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
    if (!response.ok) {
      throw new WhatsAppComponentsApiError(response.status, body)
    }
    return body
  }
}

export function createWhatsAppComponentsClient(
  options: WhatsAppComponentsClientOptions,
): WhatsAppComponentsClient {
  return new WhatsAppComponentsClient(options)
}
