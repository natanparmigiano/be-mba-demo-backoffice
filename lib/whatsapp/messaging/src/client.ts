import {
  whatsappMessageActionResponseSchema,
  whatsappSendMessageResponseSchema,
} from './schemas.js'
import {
  WhatsAppMessagingApiError,
  WhatsAppMessagingResponseError,
} from './errors.js'
import type {
  SendAudioMessageInput,
  SendContactsMessageInput,
  SendDocumentMessageInput,
  SendImageMessageInput,
  SendInteractiveMessageInput,
  SendLocationMessageInput,
  SendMessageInput,
  SendMessageResponse,
  MessageActionResponse,
  SendOptions,
  SendReactionMessageInput,
  SendStickerMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  SendVideoMessageInput,
  WhatsAppMessageRequest,
  MarkMessageReadRequest,
  ShowTypingIndicatorRequest,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppMessagingClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppMessagingClientContract {
  send(
    message: SendMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendTemplate(
    message: SendTemplateMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendAudio(
    message: SendAudioMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendContacts(
    message: SendContactsMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendDocument(
    message: SendDocumentMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendImage(
    message: SendImageMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendInteractive(
    message: SendInteractiveMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendLocation(
    message: SendLocationMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendReaction(
    message: SendReactionMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendSticker(
    message: SendStickerMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendText(
    message: SendTextMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  sendVideo(
    message: SendVideoMessageInput,
    options?: SendOptions,
  ): Promise<SendMessageResponse>
  markAsRead(
    messageId: string,
    options?: SendOptions,
  ): Promise<MessageActionResponse>
  showTypingIndicator(
    messageId: string,
    options?: SendOptions,
  ): Promise<MessageActionResponse>
}

function required(name: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new TypeError(`${name} must not be empty`)
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

function messagesUrl(
  graphApiBaseUrl: string,
  graphApiVersion: string,
  phoneNumberId: string,
): URL {
  const baseUrl = new URL(graphApiBaseUrl)
  if (baseUrl.protocol !== 'https:' && baseUrl.protocol !== 'http:') {
    throw new TypeError('graphApiBaseUrl must use http or https')
  }
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/`
  return new URL(
    `${graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
    baseUrl,
  )
}

function parseJson(body: string): unknown {
  if (!body) return undefined
  try {
    return JSON.parse(body) as unknown
  } catch (cause) {
    throw new WhatsAppMessagingResponseError(
      'WhatsApp Graph API returned invalid JSON',
      body,
      { cause },
    )
  }
}

export class WhatsAppMessagingClient implements WhatsAppMessagingClientContract {
  readonly #accessToken: string
  readonly #fetch: Fetch
  readonly #messagesUrl: URL

  constructor(options: WhatsAppMessagingClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    const phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    const version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#messagesUrl = messagesUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
      version,
      phoneNumberId,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async send(
    message: SendMessageInput,
    options: SendOptions = {},
  ): Promise<SendMessageResponse> {
    const payload: WhatsAppMessageRequest = {
      messaging_product: 'whatsapp',
      ...message,
    }
    const body = await this.#post(payload, options)

    const result = whatsappSendMessageResponseSchema.safeParse(body)
    if (!result.success) {
      throw new WhatsAppMessagingResponseError(
        'WhatsApp Graph API returned an unexpected send-message response',
        body,
        { cause: result.error },
      )
    }
    return result.data
  }

  sendAudio(message: SendAudioMessageInput, options?: SendOptions) {
    return this.send({ type: 'audio', ...message }, options)
  }

  sendContacts(message: SendContactsMessageInput, options?: SendOptions) {
    return this.send({ type: 'contacts', ...message }, options)
  }

  sendDocument(message: SendDocumentMessageInput, options?: SendOptions) {
    return this.send({ type: 'document', ...message }, options)
  }

  sendImage(message: SendImageMessageInput, options?: SendOptions) {
    return this.send({ type: 'image', ...message }, options)
  }

  sendInteractive(message: SendInteractiveMessageInput, options?: SendOptions) {
    return this.send({ type: 'interactive', ...message }, options)
  }

  sendLocation(message: SendLocationMessageInput, options?: SendOptions) {
    return this.send({ type: 'location', ...message }, options)
  }

  sendReaction(message: SendReactionMessageInput, options?: SendOptions) {
    return this.send({ type: 'reaction', ...message }, options)
  }

  sendSticker(message: SendStickerMessageInput, options?: SendOptions) {
    return this.send({ type: 'sticker', ...message }, options)
  }

  sendTemplate(message: SendTemplateMessageInput, options?: SendOptions) {
    return this.send({ type: 'template', ...message }, options)
  }

  sendText(message: SendTextMessageInput, options?: SendOptions) {
    return this.send({ type: 'text', ...message }, options)
  }

  sendVideo(message: SendVideoMessageInput, options?: SendOptions) {
    return this.send({ type: 'video', ...message }, options)
  }

  async markAsRead(
    messageId: string,
    options: SendOptions = {},
  ): Promise<MessageActionResponse> {
    const payload: MarkMessageReadRequest = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: required('messageId', messageId),
    }
    return this.#sendAction(payload, options)
  }

  async showTypingIndicator(
    messageId: string,
    options: SendOptions = {},
  ): Promise<MessageActionResponse> {
    const payload: ShowTypingIndicatorRequest = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: required('messageId', messageId),
      typing_indicator: { type: 'text' },
    }
    return this.#sendAction(payload, options)
  }

  async #post(payload: object, options: SendOptions): Promise<unknown> {
    const response = await this.#fetch(this.#messagesUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    })
    const responseText = await response.text()
    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = responseText
          ? (JSON.parse(responseText) as unknown)
          : undefined
      } catch {
        errorBody = responseText
      }
      throw new WhatsAppMessagingApiError(response.status, errorBody)
    }
    return parseJson(responseText)
  }

  async #sendAction(
    payload: MarkMessageReadRequest | ShowTypingIndicatorRequest,
    options: SendOptions,
  ): Promise<MessageActionResponse> {
    const body = await this.#post(payload, options)
    const result = whatsappMessageActionResponseSchema.safeParse(body)
    if (!result.success) {
      throw new WhatsAppMessagingResponseError(
        'WhatsApp Graph API returned an unexpected message action response',
        body,
        { cause: result.error },
      )
    }
    return result.data
  }
}

export function createWhatsAppMessagingClient(
  options: WhatsAppMessagingClientOptions,
): WhatsAppMessagingClient {
  return new WhatsAppMessagingClient(options)
}
