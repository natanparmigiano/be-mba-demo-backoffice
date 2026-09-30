import type { KeyValueStore, SetOptions } from './types.js'

interface Entry {
  expiresAt: number | null
  value: string
}

type Clock = () => number

export class MemoryKeyValueStore implements KeyValueStore {
  readonly mode = 'memory' as const

  private readonly entries = new Map<string, Entry>()

  constructor(private readonly now: Clock = Date.now) {}

  async get(key: string): Promise<string | null> {
    return this.getLiveEntry(key)?.value ?? null
  }

  async getDel(key: string): Promise<string | null> {
    const value = await this.get(key)
    this.entries.delete(key)
    return value
  }

  async set(
    key: string,
    value: string,
    options: SetOptions = {},
  ): Promise<boolean> {
    validateSetOptions(options)

    const current = this.getLiveEntry(key)

    if (options.condition === 'if-exists' && !current) return false
    if (options.condition === 'if-not-exists' && current) return false

    this.entries.set(key, {
      value,
      expiresAt:
        options.ttlSeconds === undefined
          ? null
          : this.now() + options.ttlSeconds * 1_000,
    })

    return true
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0

    for (const key of keys) {
      this.deleteIfExpired(key)
      if (this.entries.delete(key)) deleted += 1
    }

    return deleted
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.reduce(
      (count, key) => count + (this.getLiveEntry(key) ? 1 : 0),
      0,
    )
  }

  async mGet(keys: string[]): Promise<Array<string | null>> {
    return Promise.all(keys.map((key) => this.get(key)))
  }

  async mSet(entries: Readonly<Record<string, string>>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.entries.set(key, { value, expiresAt: null })
    }
  }

  async incr(key: string): Promise<number> {
    return this.incrBy(key, 1)
  }

  async incrBy(key: string, increment: number): Promise<number> {
    validateInteger(increment, 'increment')
    const current = this.getLiveEntry(key)
    const currentValue = current ? parseInteger(current.value) : 0
    const nextValue = currentValue + increment

    validateInteger(nextValue, 'result')
    this.entries.set(key, {
      value: String(nextValue),
      expiresAt: current?.expiresAt ?? null,
    })

    return nextValue
  }

  async decr(key: string): Promise<number> {
    return this.decrBy(key, 1)
  }

  async decrBy(key: string, decrement: number): Promise<number> {
    validateInteger(decrement, 'decrement')
    return this.incrBy(key, -decrement)
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    validateInteger(seconds, 'seconds')
    const current = this.getLiveEntry(key)

    if (!current) return false

    if (seconds <= 0) {
      this.entries.delete(key)
    } else {
      current.expiresAt = this.now() + seconds * 1_000
    }

    return true
  }

  async persist(key: string): Promise<boolean> {
    const current = this.getLiveEntry(key)

    if (!current || current.expiresAt === null) return false

    current.expiresAt = null
    return true
  }

  async ttl(key: string): Promise<number> {
    const current = this.getLiveEntry(key)

    if (!current) return -2
    if (current.expiresAt === null) return -1

    return Math.max(0, Math.ceil((current.expiresAt - this.now()) / 1_000))
  }

  async ping(): Promise<'PONG'> {
    return 'PONG'
  }

  async close(): Promise<void> {}

  private getLiveEntry(key: string): Entry | undefined {
    this.deleteIfExpired(key)
    return this.entries.get(key)
  }

  private deleteIfExpired(key: string): void {
    const entry = this.entries.get(key)

    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key)
    }
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

function parseInteger(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new TypeError('Value is not an integer')
  }

  const parsed = Number(value)
  validateInteger(parsed, 'stored value')
  return parsed
}
