export type FileStoreMode = 'fs' | 's3'
export type SignedUrlOperation = 'download' | 'upload'

export interface StoredFile {
  body: Uint8Array
  contentType?: string
  lastModified?: Date
  size: number
}

export interface PutFileOptions {
  contentType?: string
}

export interface SignUrlOptions {
  contentType?: string
  expiresInSeconds?: number
  operation: SignedUrlOperation
}

export interface VerifiedSignedFileUrl {
  contentType?: string
  key: string
  operation: SignedUrlOperation
}

export interface FileStore {
  readonly mode: FileStoreMode
  get(key: string): Promise<StoredFile | null>
  put(key: string, body: Uint8Array, options?: PutFileOptions): Promise<void>
  delete(key: string): Promise<void>
  signUrl(key: string, options: SignUrlOptions): Promise<string>
  verifySignedUrl?(
    url: URL,
    operation: SignedUrlOperation,
  ): VerifiedSignedFileUrl | null
  close(): Promise<void>
}

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60
export const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60

export function validateFileKey(key: string): void {
  const segments = key.split('/')

  if (
    key.length === 0 ||
    Buffer.byteLength(key) > 1_024 ||
    key.includes('\\') ||
    key.includes('\0') ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new TypeError(
      'File key must be a non-empty relative path without empty, dot, or backslash segments',
    )
  }
}

export function validateContentType(contentType: string | undefined): void {
  if (contentType === undefined) return

  if (
    contentType.length === 0 ||
    contentType.length > 255 ||
    /[^\x20-\x7e]/.test(contentType)
  ) {
    throw new TypeError('contentType must be a printable HTTP header value')
  }
}

export function resolveSignedUrlTtl(expiresInSeconds?: number): number {
  const ttl = expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS

  if (
    !Number.isSafeInteger(ttl) ||
    ttl <= 0 ||
    ttl > MAX_SIGNED_URL_TTL_SECONDS
  ) {
    throw new RangeError(
      `expiresInSeconds must be between 1 and ${MAX_SIGNED_URL_TTL_SECONDS}`,
    )
  }

  return ttl
}
