import {
  getFileStoreConfiguration,
  type FileStoreConfiguration,
} from './env.js'
import { FileSystemFileStore } from './filesystem.js'
import { S3FileStore } from './s3.js'
import type { FileStore } from './types.js'

export function createFileStore(
  configuration: FileStoreConfiguration = getFileStoreConfiguration(),
): FileStore {
  return configuration.adapter === 's3'
    ? new S3FileStore(configuration)
    : new FileSystemFileStore(configuration)
}

export const files = createFileStore()

export {
  getFileStoreConfiguration,
  type FileStoreConfiguration,
  type FileSystemConfiguration,
  type S3Configuration,
} from './env.js'
export { FileSystemFileStore } from './filesystem.js'
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
