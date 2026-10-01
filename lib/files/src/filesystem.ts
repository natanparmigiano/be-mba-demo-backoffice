import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { FileSystemConfiguration } from './env.js'
import { HmacSignedUrlSupport } from './signed-url.js'
import {
  validateContentType,
  validateFileKey,
  type FileStore,
  type PutFileOptions,
  type SignUrlOptions,
  type SignedUrlOperation,
  type StoredFile,
  type VerifiedSignedFileUrl,
} from './types.js'

type Clock = () => number

interface FileMetadata {
  contentType?: string
  key: string
}

export class FileSystemFileStore implements FileStore {
  readonly mode = 'fs' as const

  private readonly directory: string
  private readonly signedUrls: HmacSignedUrlSupport
  private closed = false

  constructor(configuration: FileSystemConfiguration, now: Clock = Date.now) {
    this.directory = resolve(configuration.directory)
    this.signedUrls = new HmacSignedUrlSupport(configuration, now)
  }

  async get(key: string): Promise<StoredFile | null> {
    this.assertOpen()
    validateFileKey(key)
    const paths = this.pathsFor(key)

    try {
      const [body, fileStat, metadata] = await Promise.all([
        readFile(paths.object),
        stat(paths.object),
        this.readMetadata(paths.metadata, key),
      ])

      return {
        body: new Uint8Array(body),
        contentType: metadata?.contentType,
        lastModified: fileStat.mtime,
        size: body.byteLength,
      }
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return null
      throw error
    }
  }

  async put(
    key: string,
    body: Uint8Array,
    options: PutFileOptions = {},
  ): Promise<void> {
    this.assertOpen()
    validateFileKey(key)
    validateContentType(options.contentType)
    const paths = this.pathsFor(key)
    const objectTemp = `${paths.object}.${randomUUID()}.tmp`
    const metadataTemp = `${paths.metadata}.${randomUUID()}.tmp`

    await Promise.all([
      mkdir(dirname(paths.object), { recursive: true }),
      mkdir(dirname(paths.metadata), { recursive: true }),
    ])

    let objectCommitted = false

    try {
      await writeFile(objectTemp, body, { flag: 'wx' })
      await writeFile(
        metadataTemp,
        JSON.stringify({
          key,
          contentType: options.contentType,
        } satisfies FileMetadata),
        { flag: 'wx' },
      )
      await rename(objectTemp, paths.object)
      objectCommitted = true
      await rename(metadataTemp, paths.metadata)
    } catch (error) {
      await Promise.all([
        unlink(objectTemp).catch(ignoreMissingFile),
        unlink(metadataTemp).catch(ignoreMissingFile),
        ...(objectCommitted
          ? [unlink(paths.metadata).catch(ignoreMissingFile)]
          : []),
      ])
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    this.assertOpen()
    validateFileKey(key)
    const paths = this.pathsFor(key)

    await Promise.all([
      unlink(paths.object).catch(ignoreMissingFile),
      unlink(paths.metadata).catch(ignoreMissingFile),
    ])
  }

  async signUrl(key: string, options: SignUrlOptions): Promise<string> {
    this.assertOpen()
    return this.signedUrls.sign(key, options)
  }

  verifySignedUrl(
    url: URL,
    operation: SignedUrlOperation,
  ): VerifiedSignedFileUrl | null {
    this.assertOpen()

    return this.signedUrls.verify(url, operation)
  }

  async close(): Promise<void> {
    this.closed = true
  }

  private pathsFor(key: string): { metadata: string; object: string } {
    const digest = createHash('sha256').update(key).digest('hex')
    const prefix = digest.slice(0, 2)

    return {
      metadata: join(this.directory, 'metadata', prefix, `${digest}.json`),
      object: join(this.directory, 'objects', prefix, digest),
    }
  }

  private async readMetadata(
    path: string,
    expectedKey: string,
  ): Promise<FileMetadata | undefined> {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))

      if (!isFileMetadata(parsed) || parsed.key !== expectedKey) {
        throw new Error('Filesystem file metadata is invalid')
      }

      return parsed
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return undefined
      throw error
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('File store is closed')
  }
}

function isFileMetadata(value: unknown): value is FileMetadata {
  return (
    value !== null &&
    typeof value === 'object' &&
    'key' in value &&
    typeof value.key === 'string' &&
    (!('contentType' in value) ||
      value.contentType === undefined ||
      typeof value.contentType === 'string')
  )
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function ignoreMissingFile(error: unknown): void {
  if (!isNodeError(error, 'ENOENT')) throw error
}
