import {
  getFileStoreConfiguration,
  type FileStoreConfiguration,
} from './env.js'
import { FileSystemFileStore } from './filesystem.js'
import { PostgresFileStore } from './postgres.js'
import { S3FileStore } from './s3.js'
import type { FileStore } from './types.js'

export function createFileStore(
  configuration: FileStoreConfiguration = getFileStoreConfiguration(),
): FileStore {
  if (configuration.adapter === 's3') return new S3FileStore(configuration)
  if (configuration.adapter === 'postgres') {
    return new PostgresFileStore(configuration)
  }
  return new FileSystemFileStore(configuration)
}

export const files = createFileStore()

export {
  getFileStoreConfiguration,
  type FileStoreConfiguration,
  type FileSystemConfiguration,
  type PostgresConfiguration,
  type S3Configuration,
} from './env.js'
export { FileSystemFileStore } from './filesystem.js'
export {
  PostgresFileStore,
  type PostgresFileStoreBackend,
  type PostgresStoredFile,
} from './postgres.js'
export {
  S3FileStore,
  type S3FileCommand,
  type S3FileCommandOutput,
  type S3FileStoreBackend,
} from './s3.js'
export {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  MAX_SIGNED_URL_TTL_SECONDS,
  validateContentType,
  validateFileKey,
  type FileStore,
  type FileStoreMode,
  type PutFileOptions,
  type SignUrlOptions,
  type SignedUrlOperation,
  type StoredFile,
  type VerifiedSignedFileUrl,
} from './types.js'
