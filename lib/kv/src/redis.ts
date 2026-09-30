import { createClient, type RedisClientType } from 'redis'
import type { KeyValueStore, SetOptions } from './types.js'

export class RedisKeyValueStore implements KeyValueStore {
  readonly mode = 'redis' as const

  private readonly client: RedisClientType
  private connecting: Promise<void> | undefined

  constructor(url: string) {
    this.client = createClient({ url })
    this.client.on('error', (error: Error) => {
      console.error('Redis client error', error)
    })
  }

  async get(key: string): Promise<string | null> {
    return (await this.connectedClient()).get(key)
  }

  async getDel(key: string): Promise<string | null> {
    return (await this.connectedClient()).getDel(key)
  }

  async set(
    key: string,
    value: string,
    options: SetOptions = {},
  ): Promise<boolean> {
    validateSetOptions(options)

    const result = await (
      await this.connectedClient()
    ).set(key, value, {
      expiration:
        options.ttlSeconds === undefined
          ? undefined
          : { type: 'EX', value: options.ttlSeconds },
      condition:
        options.condition === 'if-exists'
          ? 'XX'
          : options.condition === 'if-not-exists'
            ? 'NX'
            : undefined,
    })

    return result === 'OK'
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0
    return (await this.connectedClient()).del(keys)
  }

  async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0
    return (await this.connectedClient()).exists(keys)
  }

  async mGet(keys: string[]): Promise<Array<string | null>> {
    if (keys.length === 0) return []
    return (await this.connectedClient()).mGet(keys)
  }

  async mSet(entries: Readonly<Record<string, string>>): Promise<void> {
    if (Object.keys(entries).length === 0) return
    await (await this.connectedClient()).mSet(entries)
  }

  async incr(key: string): Promise<number> {
    return (await this.connectedClient()).incr(key)
  }

  async incrBy(key: string, increment: number): Promise<number> {
    validateInteger(increment, 'increment')
    return (await this.connectedClient()).incrBy(key, increment)
  }

  async decr(key: string): Promise<number> {
    return (await this.connectedClient()).decr(key)
  }

  async decrBy(key: string, decrement: number): Promise<number> {
    validateInteger(decrement, 'decrement')
    return (await this.connectedClient()).decrBy(key, decrement)
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    validateInteger(seconds, 'seconds')
    return (await (await this.connectedClient()).expire(key, seconds)) === 1
  }

  async persist(key: string): Promise<boolean> {
    return (await (await this.connectedClient()).persist(key)) === 1
  }

  async ttl(key: string): Promise<number> {
    return (await this.connectedClient()).ttl(key)
  }

  async ping(): Promise<'PONG'> {
    const response = await (await this.connectedClient()).ping()

    if (response !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${response}`)
    }

    return response
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close()
    }
  }

  private async connectedClient(): Promise<RedisClientType> {
    if (!this.client.isOpen) {
      this.connecting ??= this.client.connect().then(() => undefined)

      try {
        await this.connecting
      } finally {
        this.connecting = undefined
      }
    }

    return this.client
  }
}

function validateSetOptions(options: SetOptions): void {
  if (options.ttlSeconds !== undefined) {
    validateInteger(options.ttlSeconds, 'ttlSeconds')

    if (options.ttlSeconds <= 0) {
      throw new RangeError('ttlSeconds must be greater than zero')
    }
  }
}

function validateInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer`)
  }
}
