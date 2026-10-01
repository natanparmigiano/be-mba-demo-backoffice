import { db, storedFiles, type Database } from '@mba-demo/db'
import { eq } from 'drizzle-orm'
import type { PostgresConfiguration } from './env.js'
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

export interface PostgresStoredFile {
  blob: Uint8Array
  contentType?: string
  path: string
  updatedAt: Date
}

export interface PostgresFileStoreBackend {
  delete(path: string): Promise<void>
  get(path: string): Promise<PostgresStoredFile | null>
  put(file: PostgresStoredFile): Promise<void>
}

export class PostgresFileStore implements FileStore {
  readonly mode = 'postgres' as const

  private readonly signedUrls: HmacSignedUrlSupport
  private closed = false

  constructor(
    configuration: PostgresConfiguration,
    private readonly backend: PostgresFileStoreBackend = new DrizzlePostgresFileStoreBackend(
      db,
    ),
    now: Clock = Date.now,
  ) {
    this.signedUrls = new HmacSignedUrlSupport(configuration, now)
  }

  async get(key: string): Promise<StoredFile | null> {
    this.assertOpen()
    validateFileKey(key)
    const file = await this.backend.get(key)

    if (!file) return null
    const body = new Uint8Array(file.blob)
    return {
      body,
      contentType: file.contentType ?? undefined,
      lastModified: file.updatedAt,
      size: body.byteLength,
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
    await this.backend.put({
      path: key,
      blob: body,
      contentType: options.contentType,
      updatedAt: new Date(),
    })
  }

  async delete(key: string): Promise<void> {
    this.assertOpen()
    validateFileKey(key)
    await this.backend.delete(key)
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

  private assertOpen(): void {
    if (this.closed) throw new Error('File store is closed')
  }
}

class DrizzlePostgresFileStoreBackend implements PostgresFileStoreBackend {
  constructor(private readonly database: Database) {}

  async get(path: string): Promise<PostgresStoredFile | null> {
    const [file] = await this.database
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.path, path))
      .limit(1)

    return file
      ? {
          ...file,
          contentType: file.contentType ?? undefined,
        }
      : null
  }

  async put(file: PostgresStoredFile): Promise<void> {
    await this.database.insert(storedFiles).values(file).onConflictDoUpdate({
      target: storedFiles.path,
      set: file,
    })
  }

  async delete(path: string): Promise<void> {
    await this.database.delete(storedFiles).where(eq(storedFiles.path, path))
  }
}
