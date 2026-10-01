import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  resolveSignedUrlTtl,
  validateContentType,
  validateFileKey,
  type SignUrlOptions,
  type SignedUrlOperation,
  type VerifiedSignedFileUrl,
} from './types.js'

type Clock = () => number

export interface HmacSignedUrlConfiguration {
  publicUrl: string
  signingSecret: string
}

export class HmacSignedUrlSupport {
  constructor(
    private readonly configuration: HmacSignedUrlConfiguration,
    private readonly now: Clock = Date.now,
  ) {}

  sign(key: string, options: SignUrlOptions): string {
    validateFileKey(key)
    validateContentType(options.contentType)
    const expires =
      Math.floor(this.now() / 1_000) +
      resolveSignedUrlTtl(options.expiresInSeconds)
    const url = new URL(this.configuration.publicUrl)
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/files/signed`
    url.searchParams.set('key', key)
    url.searchParams.set('operation', options.operation)
    url.searchParams.set('expires', String(expires))

    if (options.contentType !== undefined) {
      url.searchParams.set('contentType', options.contentType)
    }

    url.searchParams.set(
      'signature',
      this.signature(key, options.operation, expires, options.contentType),
    )
    return url.toString()
  }

  verify(
    url: URL,
    operation: SignedUrlOperation,
  ): VerifiedSignedFileUrl | null {
    if (!hasOnlySignedUrlParameters(url)) return null

    const key = getSingleParameter(url, 'key')
    const signedOperation = getSingleParameter(url, 'operation')
    const expiresValue = getSingleParameter(url, 'expires')
    const contentType = getOptionalSingleParameter(url, 'contentType')
    const suppliedSignature = getSingleParameter(url, 'signature')

    if (
      key === null ||
      signedOperation !== operation ||
      expiresValue === null ||
      suppliedSignature === null ||
      !/^\d+$/.test(expiresValue) ||
      !/^[a-f\d]{64}$/.test(suppliedSignature)
    ) {
      return null
    }

    const expires = Number(expiresValue)
    if (
      !Number.isSafeInteger(expires) ||
      expires <= Math.floor(this.now() / 1_000)
    ) {
      return null
    }

    try {
      validateFileKey(key)
      validateContentType(contentType)
    } catch {
      return null
    }

    const supplied = Buffer.from(suppliedSignature, 'hex')
    const expected = Buffer.from(
      this.signature(key, operation, expires, contentType),
      'hex',
    )

    if (!timingSafeEqual(supplied, expected)) return null
    return { key, operation, contentType }
  }

  private signature(
    key: string,
    operation: SignedUrlOperation,
    expires: number,
    contentType: string | undefined,
  ): string {
    return createHmac('sha256', this.configuration.signingSecret)
      .update(
        ['v1', operation, String(expires), key, contentType ?? ''].join('\n'),
      )
      .digest('hex')
  }
}

function hasOnlySignedUrlParameters(url: URL): boolean {
  const allowed = new Set([
    'key',
    'operation',
    'expires',
    'contentType',
    'signature',
  ])
  return [...url.searchParams.keys()].every(
    (key) => allowed.has(key) && url.searchParams.getAll(key).length === 1,
  )
}

function getSingleParameter(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name)
  return values.length === 1 && values[0] !== '' ? (values[0] ?? null) : null
}

function getOptionalSingleParameter(
  url: URL,
  name: string,
): string | undefined {
  const values = url.searchParams.getAll(name)
  return values.length === 0
    ? undefined
    : values.length === 1
      ? values[0]
      : undefined
}
