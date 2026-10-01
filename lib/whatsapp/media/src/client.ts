import { WhatsAppMediaApiError, WhatsAppMediaResponseError } from './errors.js'
import {
  MEDIA_SIZE_LIMIT_BYTES,
  type DeleteMediaResponse,
  type DownloadedMedia,
  type MediaMetadata,
  type MediaRequestOptions,
  type UploadAudioInput,
  type UploadDocumentInput,
  type UploadImageInput,
  type UploadMediaInput,
  type UploadMediaResponse,
  type UploadStickerInput,
  type UploadVideoInput,
} from './types.js'

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface WhatsAppMediaClientOptions {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  graphApiBaseUrl?: string
  fetch?: Fetch
}

export interface WhatsAppMediaClientContract {
  upload(
    input: UploadMediaInput,
    options?: MediaRequestOptions,
  ): Promise<UploadMediaResponse>
  uploadAudio(
    input: UploadAudioInput,
    options?: MediaRequestOptions,
  ): Promise<UploadMediaResponse>
  uploadDocument(
    input: UploadDocumentInput,
    options?: MediaRequestOptions,
  ): Promise<UploadMediaResponse>
  uploadImage(
    input: UploadImageInput,
    options?: MediaRequestOptions,
  ): Promise<UploadMediaResponse>
  uploadSticker(
    input: UploadStickerInput,
    options?: MediaRequestOptions,
  ): Promise<UploadMediaResponse>
  uploadVideo(
    input: UploadVideoInput,
    options?: MediaRequestOptions,
  ): Promise<UploadMediaResponse>
  getMediaUrl(
    mediaId: string,
    options?: MediaRequestOptions,
  ): Promise<MediaMetadata>
  download(
    mediaUrl: string | URL,
    options?: MediaRequestOptions,
  ): Promise<DownloadedMedia>
  delete(
    mediaId: string,
    options?: MediaRequestOptions,
  ): Promise<DeleteMediaResponse>
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

function absoluteHttpUrl(value: string | URL, name: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`${name} must use http or https`)
  }
  return url
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new WhatsAppMediaResponseError(
      'WhatsApp Graph API returned invalid JSON',
      text,
      { cause },
    )
  }
}

async function errorBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseUploadResponse(body: unknown): UploadMediaResponse {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new WhatsAppMediaResponseError(
      'WhatsApp Graph API returned an unexpected upload response',
      body,
    )
  }
  return { id: body.id }
}

function parseMetadata(body: unknown): MediaMetadata {
  if (
    !isRecord(body) ||
    body.messaging_product !== 'whatsapp' ||
    typeof body.url !== 'string' ||
    typeof body.mime_type !== 'string' ||
    typeof body.sha256 !== 'string' ||
    (typeof body.file_size !== 'string' &&
      typeof body.file_size !== 'number') ||
    typeof body.id !== 'string'
  ) {
    throw new WhatsAppMediaResponseError(
      'WhatsApp Graph API returned unexpected media metadata',
      body,
    )
  }
  return {
    messaging_product: 'whatsapp',
    url: body.url,
    mime_type: body.mime_type,
    sha256: body.sha256,
    file_size: body.file_size,
    id: body.id,
  }
}

function parseDeleteResponse(body: unknown): DeleteMediaResponse {
  if (!isRecord(body) || body.success !== true) {
    throw new WhatsAppMediaResponseError(
      'WhatsApp Graph API returned an unexpected delete response',
      body,
    )
  }
  return { success: true }
}

export class WhatsAppMediaClient implements WhatsAppMediaClientContract {
  readonly #accessToken: string
  readonly #baseUrl: URL
  readonly #fetch: Fetch
  readonly #phoneNumberId: string
  readonly #version: string

  constructor(options: WhatsAppMediaClientOptions) {
    this.#accessToken = required('accessToken', options.accessToken)
    this.#phoneNumberId = required('phoneNumberId', options.phoneNumberId)
    this.#version = normalizeVersion(
      options.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    )
    this.#baseUrl = normalizeBaseUrl(
      options.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL,
    )
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async upload(
    input: UploadMediaInput,
    options: MediaRequestOptions = {},
  ): Promise<UploadMediaResponse> {
    const filename = required('filename', input.filename)
    const limit = MEDIA_SIZE_LIMIT_BYTES[input.kind]
    if (input.file.size > limit) {
      throw new RangeError(
        `${input.kind} exceeds the ${limit}-byte WhatsApp upload limit`,
      )
    }

    const file =
      input.file.type === input.mimeType
        ? input.file
        : input.file.slice(0, input.file.size, input.mimeType)
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('file', file, filename)

    const response = await this.#fetch(
      this.#graphUrl(`${encodeURIComponent(this.#phoneNumberId)}/media`),
      {
        method: 'POST',
        headers: this.#authorizationHeaders(),
        body: form,
        signal: options.signal,
      },
    )
    const body = parseJson(await response.text())
    if (!response.ok) throw new WhatsAppMediaApiError(response.status, body)
    return parseUploadResponse(body)
  }

  uploadAudio(input: UploadAudioInput, options?: MediaRequestOptions) {
    return this.upload({ kind: 'audio', ...input }, options)
  }

  uploadDocument(input: UploadDocumentInput, options?: MediaRequestOptions) {
    return this.upload({ kind: 'document', ...input }, options)
  }

  uploadImage(input: UploadImageInput, options?: MediaRequestOptions) {
    return this.upload({ kind: 'image', ...input }, options)
  }

  uploadSticker(input: UploadStickerInput, options?: MediaRequestOptions) {
    return this.upload({ kind: 'sticker', ...input }, options)
  }

  uploadVideo(input: UploadVideoInput, options?: MediaRequestOptions) {
    return this.upload({ kind: 'video', ...input }, options)
  }

  async getMediaUrl(
    mediaId: string,
    options: MediaRequestOptions = {},
  ): Promise<MediaMetadata> {
    const url = this.#graphUrl(encodeURIComponent(required('mediaId', mediaId)))
    url.searchParams.set('phone_number_id', this.#phoneNumberId)
    const response = await this.#fetch(url, {
      method: 'GET',
      headers: this.#authorizationHeaders(),
      signal: options.signal,
    })
    const body = parseJson(await response.text())
    if (!response.ok) throw new WhatsAppMediaApiError(response.status, body)
    return parseMetadata(body)
  }

  async download(
    mediaUrl: string | URL,
    options: MediaRequestOptions = {},
  ): Promise<DownloadedMedia> {
    const url = absoluteHttpUrl(mediaUrl, 'mediaUrl')
    const response = await this.#fetch(url, {
      method: 'GET',
      headers: this.#authorizationHeaders(),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new WhatsAppMediaApiError(
        response.status,
        await errorBody(response),
      )
    }

    const contentLengthHeader = response.headers.get('content-length')
    const contentLength =
      contentLengthHeader === null ? null : Number(contentLengthHeader)
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get('content-type'),
      contentLength:
        contentLength !== null && Number.isFinite(contentLength)
          ? contentLength
          : null,
      contentDisposition: response.headers.get('content-disposition'),
    }
  }

  async delete(
    mediaId: string,
    options: MediaRequestOptions = {},
  ): Promise<DeleteMediaResponse> {
    const url = this.#graphUrl(encodeURIComponent(required('mediaId', mediaId)))
    url.searchParams.set('phone_number_id', this.#phoneNumberId)
    const response = await this.#fetch(url, {
      method: 'DELETE',
      headers: this.#authorizationHeaders(),
      signal: options.signal,
    })
    const body = parseJson(await response.text())
    if (!response.ok) throw new WhatsAppMediaApiError(response.status, body)
    return parseDeleteResponse(body)
  }

  #authorizationHeaders(): HeadersInit {
    return { authorization: `Bearer ${this.#accessToken}` }
  }

  #graphUrl(path: string): URL {
    return new URL(`${this.#version}/${path}`, this.#baseUrl)
  }
}

export function createWhatsAppMediaClient(
  options: WhatsAppMediaClientOptions,
): WhatsAppMediaClient {
  return new WhatsAppMediaClient(options)
}
