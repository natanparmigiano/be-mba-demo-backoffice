import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import {
  S3FileStore,
  type S3FileCommand,
  type S3FileCommandOutput,
  type S3FileStoreBackend,
} from './s3.js'

describe('S3FileStore', () => {
  it('maps get, put, and delete operations to S3 commands', async () => {
    const backend = new FakeBackend()
    backend.nextOutput = {
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3]),
      },
      ContentLength: 3,
      ContentType: 'image/png',
      LastModified: new Date('2025-01-01T00:00:00Z'),
    } as GetObjectCommandOutput
    const store = createStore(backend)

    const file = await store.get('media/avatar.png')
    assert.deepEqual(file?.body, new Uint8Array([1, 2, 3]))
    assert.equal(file?.contentType, 'image/png')
    assert.ok(backend.commands[0] instanceof GetObjectCommand)

    await store.put('media/avatar.png', new Uint8Array([4, 5]), {
      contentType: 'image/png',
    })
    const put = backend.commands[1]
    assert.ok(put instanceof PutObjectCommand)
    assert.deepEqual(put.input, {
      Body: new Uint8Array([4, 5]),
      Bucket: 'files',
      ContentLength: 2,
      ContentType: 'image/png',
      Key: 'media/avatar.png',
    })

    await store.delete('media/avatar.png')
    assert.ok(backend.commands[2] instanceof DeleteObjectCommand)
  })

  it('returns null for S3 not-found responses', async () => {
    const backend = new FakeBackend()
    backend.error = Object.assign(new Error('missing'), {
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    })

    assert.equal(await createStore(backend).get('missing.txt'), null)
  })

  it('creates native signed GET and PUT URLs', async () => {
    const backend = new FakeBackend()
    const store = createStore(backend)

    assert.equal(
      await store.signUrl('download.txt', {
        operation: 'download',
        expiresInSeconds: 30,
      }),
      'https://signed.example.com/30',
    )
    assert.ok(backend.signedCommands[0] instanceof GetObjectCommand)

    await store.signUrl('upload.txt', {
      operation: 'upload',
      contentType: 'text/plain',
    })
    const upload = backend.signedCommands[1]
    assert.ok(upload instanceof PutObjectCommand)
    assert.equal(upload.input.ContentType, 'text/plain')
  })

  it('creates a missing bucket once when explicitly enabled', async () => {
    const backend = new FakeBackend()
    backend.sendImplementation = async (command) => {
      if (command instanceof HeadBucketCommand) {
        throw Object.assign(new Error('missing'), {
          $metadata: { httpStatusCode: 404 },
        })
      }
      return {} as S3FileCommandOutput
    }
    const store = createStore(backend, { createBucket: true })

    await store.put('first.txt', new Uint8Array())
    await store.delete('first.txt')

    assert.ok(backend.commands[0] instanceof HeadBucketCommand)
    assert.ok(backend.commands[1] instanceof CreateBucketCommand)
    assert.ok(backend.commands[2] instanceof PutObjectCommand)
    assert.ok(backend.commands[3] instanceof DeleteObjectCommand)
  })
})

class FakeBackend implements S3FileStoreBackend {
  readonly commands: S3FileCommand[] = []
  readonly signedCommands: Array<GetObjectCommand | PutObjectCommand> = []
  error: Error | undefined
  nextOutput = {} as S3FileCommandOutput
  sendImplementation?: (command: S3FileCommand) => Promise<S3FileCommandOutput>

  close(): void {}

  async send(command: S3FileCommand): Promise<S3FileCommandOutput> {
    this.commands.push(command)
    if (this.error) throw this.error
    if (this.sendImplementation) return this.sendImplementation(command)
    return this.nextOutput
  }

  async sign(
    command: GetObjectCommand | PutObjectCommand,
    expiresInSeconds: number,
  ): Promise<string> {
    this.signedCommands.push(command)
    return `https://signed.example.com/${expiresInSeconds}`
  }
}

function createStore(
  backend: S3FileStoreBackend,
  overrides: Partial<ConstructorParameters<typeof S3FileStore>[0]> = {},
): S3FileStore {
  return new S3FileStore(
    {
      adapter: 's3',
      bucket: 'files',
      createBucket: false,
      forcePathStyle: true,
      region: 'us-east-1',
      ...overrides,
    },
    backend,
  )
}
