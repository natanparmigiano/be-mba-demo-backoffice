import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
  type CreateBucketCommandOutput,
  type DeleteObjectCommandOutput,
  type GetObjectCommandOutput,
  type HeadBucketCommandOutput,
  type PutObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { S3Configuration } from './env.js'
import {
  resolveSignedUrlTtl,
  validateContentType,
  validateFileKey,
  type FileStore,
  type PutFileOptions,
  type SignUrlOptions,
  type StoredFile,
} from './types.js'

export type S3FileCommand =
  | CreateBucketCommand
  | DeleteObjectCommand
  | GetObjectCommand
  | HeadBucketCommand
  | PutObjectCommand
export type S3FileCommandOutput =
  | CreateBucketCommandOutput
  | DeleteObjectCommandOutput
  | GetObjectCommandOutput
  | HeadBucketCommandOutput
  | PutObjectCommandOutput

export interface S3FileStoreBackend {
  close(): void
  send(command: S3FileCommand): Promise<S3FileCommandOutput>
  sign(
    command: GetObjectCommand | PutObjectCommand,
    expiresInSeconds: number,
  ): Promise<string>
}

export class S3FileStore implements FileStore {
  readonly mode = 's3' as const

  private readonly backend: S3FileStoreBackend
  private closed = false
  private initializePromise: Promise<void> | undefined

  constructor(
    private readonly configuration: S3Configuration,
    backend?: S3FileStoreBackend,
  ) {
    this.backend = backend ?? new AwsS3FileStoreBackend(configuration)
  }

  async get(key: string): Promise<StoredFile | null> {
    this.assertOpen()
    validateFileKey(key)
    await this.ensureBucket()

    try {
      const output = (await this.backend.send(
        new GetObjectCommand({ Bucket: this.configuration.bucket, Key: key }),
      )) as GetObjectCommandOutput
      const body = output.Body

      if (!body) throw new Error('S3 returned a file without a response body')

      const bytes = await body.transformToByteArray()
      return {
        body: bytes,
        contentType: output.ContentType,
        lastModified: output.LastModified,
        size: output.ContentLength ?? bytes.byteLength,
      }
    } catch (error) {
      if (isS3NotFound(error)) return null
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
    await this.ensureBucket()
    await this.backend.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.configuration.bucket,
        ContentLength: body.byteLength,
        ContentType: options.contentType,
        Key: key,
      }),
    )
  }

  async delete(key: string): Promise<void> {
    this.assertOpen()
    validateFileKey(key)
    await this.ensureBucket()
    await this.backend.send(
      new DeleteObjectCommand({ Bucket: this.configuration.bucket, Key: key }),
    )
  }

  async signUrl(key: string, options: SignUrlOptions): Promise<string> {
    this.assertOpen()
    validateFileKey(key)
    validateContentType(options.contentType)
    await this.ensureBucket()
    const input = {
      Bucket: this.configuration.bucket,
      Key: key,
    }
    const command =
      options.operation === 'download'
        ? new GetObjectCommand(input)
        : new PutObjectCommand({ ...input, ContentType: options.contentType })

    return this.backend.sign(
      command,
      resolveSignedUrlTtl(options.expiresInSeconds),
    )
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.backend.close()
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('File store is closed')
  }

  private async ensureBucket(): Promise<void> {
    if (!this.configuration.createBucket) return

    this.initializePromise ??= this.initializeBucket().catch(
      (error: unknown) => {
        this.initializePromise = undefined
        throw error
      },
    )
    await this.initializePromise
  }

  private async initializeBucket(): Promise<void> {
    try {
      await this.backend.send(
        new HeadBucketCommand({ Bucket: this.configuration.bucket }),
      )
    } catch (error) {
      if (!isS3NotFound(error)) throw error

      await this.backend.send(
        new CreateBucketCommand({
          Bucket: this.configuration.bucket,
          CreateBucketConfiguration:
            this.configuration.region === 'us-east-1'
              ? undefined
              : {
                  LocationConstraint: this.configuration
                    .region as BucketLocationConstraint,
                },
        }),
      )
    }
  }
}

class AwsS3FileStoreBackend implements S3FileStoreBackend {
  private readonly storageClient: S3Client
  private readonly signingClient: S3Client

  constructor(configuration: S3Configuration) {
    const commonConfiguration = {
      credentials:
        configuration.accessKeyId && configuration.secretAccessKey
          ? {
              accessKeyId: configuration.accessKeyId,
              secretAccessKey: configuration.secretAccessKey,
            }
          : undefined,
      forcePathStyle: configuration.forcePathStyle,
      region: configuration.region,
    }
    this.storageClient = new S3Client({
      ...commonConfiguration,
      endpoint: configuration.endpoint,
    })
    this.signingClient = new S3Client({
      ...commonConfiguration,
      endpoint: configuration.publicEndpoint,
    })
  }

  async send(command: S3FileCommand): Promise<S3FileCommandOutput> {
    return this.storageClient.send(command as never)
  }

  async sign(
    command: GetObjectCommand | PutObjectCommand,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(this.signingClient, command, {
      expiresIn: expiresInSeconds,
    })
  }

  close(): void {
    this.storageClient.destroy()
    this.signingClient.destroy()
  }
}

function isS3NotFound(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false

  const name = 'name' in error ? error.name : undefined
  const metadata = '$metadata' in error ? error.$metadata : undefined
  const status =
    metadata !== null &&
    typeof metadata === 'object' &&
    'httpStatusCode' in metadata
      ? metadata.httpStatusCode
      : undefined

  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}
