import { db, keyValueEntries, type Database } from '@mba-desk/db'
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import type { KeyValueStore, SetOptions } from './types.js'

export interface PostgresKeyValueBackend {
  del(keys: string[]): Promise<number>
  expire(key: string, seconds: number): Promise<boolean>
  get(key: string): Promise<string | null>
  getDel(key: string): Promise<string | null>
  incrBy(key: string, increment: number): Promise<number>
  mGet(keys: string[]): Promise<Array<string | null>>
  mSet(entries: Readonly<Record<string, string>>): Promise<void>
  ping(): Promise<void>
  persist(key: string): Promise<boolean>
  set(key: string, value: string, options: SetOptions): Promise<boolean>
  ttl(key: string): Promise<number>
}

export class PostgresKeyValueStore implements KeyValueStore {
  readonly mode = 'postgres' as const

  constructor(
    private readonly backend: PostgresKeyValueBackend = new DrizzlePostgresKeyValueBackend(
      db,
    ),
  ) {}

  get(key: string): Promise<string | null> {
    return this.backend.get(key)
  }

  getDel(key: string): Promise<string | null> {
    return this.backend.getDel(key)
  }

  async set(
    key: string,
    value: string,
    options: SetOptions = {},
  ): Promise<boolean> {
    validateSetOptions(options)
    return await this.backend.set(key, value, options)
  }

  del(...keys: string[]): Promise<number> {
    return this.backend.del(keys)
  }

  async exists(...keys: string[]): Promise<number> {
    const values = await this.backend.mGet(keys)
    return values.reduce((count, value) => count + (value === null ? 0 : 1), 0)
  }

  mGet(keys: string[]): Promise<Array<string | null>> {
    return this.backend.mGet(keys)
  }

  mSet(entries: Readonly<Record<string, string>>): Promise<void> {
    return this.backend.mSet(entries)
  }

  incr(key: string): Promise<number> {
    return this.incrBy(key, 1)
  }

  async incrBy(key: string, increment: number): Promise<number> {
    validateInteger(increment, 'increment')
    return await this.backend.incrBy(key, increment)
  }

  decr(key: string): Promise<number> {
    return this.decrBy(key, 1)
  }

  async decrBy(key: string, decrement: number): Promise<number> {
    validateInteger(decrement, 'decrement')
    return await this.backend.incrBy(key, -decrement)
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    validateInteger(seconds, 'seconds')
    return await this.backend.expire(key, seconds)
  }

  persist(key: string): Promise<boolean> {
    return this.backend.persist(key)
  }

  ttl(key: string): Promise<number> {
    return this.backend.ttl(key)
  }

  async ping(): Promise<'PONG'> {
    await this.backend.ping()
    return 'PONG'
  }

  async close(): Promise<void> {}
}

class DrizzlePostgresKeyValueBackend implements PostgresKeyValueBackend {
  constructor(private readonly database: Database) {}

  async get(key: string): Promise<string | null> {
    const [entry] = await this.database
      .select({ value: keyValueEntries.value })
      .from(keyValueEntries)
      .where(and(eq(keyValueEntries.key, key), liveEntry()))
      .limit(1)
    return entry?.value ?? null
  }

  async getDel(key: string): Promise<string | null> {
    const [entry] = await this.database
      .delete(keyValueEntries)
      .where(and(eq(keyValueEntries.key, key), liveEntry()))
      .returning({ value: keyValueEntries.value })
    return entry?.value ?? null
  }

  async set(key: string, value: string, options: SetOptions): Promise<boolean> {
    const expiresAt = options.ttlSeconds
      ? new Date(Date.now() + options.ttlSeconds * 1_000)
      : null

    if (options.condition === 'if-exists') {
      const updated = await this.database
        .update(keyValueEntries)
        .set({ value, expiresAt })
        .where(and(eq(keyValueEntries.key, key), liveEntry()))
        .returning({ key: keyValueEntries.key })
      return updated.length > 0
    }

    const query = this.database
      .insert(keyValueEntries)
      .values({ key, value, expiresAt })

    const written = await (
      options.condition === 'if-not-exists'
        ? query.onConflictDoUpdate({
            target: keyValueEntries.key,
            set: { value, expiresAt },
            setWhere: sql`${keyValueEntries.expiresAt} <= now()`,
          })
        : query.onConflictDoUpdate({
            target: keyValueEntries.key,
            set: { value, expiresAt },
          })
    ).returning({ key: keyValueEntries.key })

    return written.length > 0
  }

  async del(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0
    const deleted = await this.database
      .delete(keyValueEntries)
      .where(and(inArray(keyValueEntries.key, [...new Set(keys)]), liveEntry()))
      .returning({ key: keyValueEntries.key })
    return deleted.length
  }

  async mGet(keys: string[]): Promise<Array<string | null>> {
    if (keys.length === 0) return []
    const uniqueKeys = [...new Set(keys)]
    const entries = await this.database
      .select({ key: keyValueEntries.key, value: keyValueEntries.value })
      .from(keyValueEntries)
      .where(and(inArray(keyValueEntries.key, uniqueKeys), liveEntry()))
    const values = new Map(entries.map((entry) => [entry.key, entry.value]))
    return keys.map((key) => values.get(key) ?? null)
  }

  async mSet(entries: Readonly<Record<string, string>>): Promise<void> {
    const values = Object.entries(entries).map(([key, value]) => ({
      key,
      value,
      expiresAt: null,
    }))
    if (values.length === 0) return
    await this.database
      .insert(keyValueEntries)
      .values(values)
      .onConflictDoUpdate({
        target: keyValueEntries.key,
        set: { value: sql`excluded.value`, expiresAt: null },
      })
  }

  async incrBy(key: string, increment: number): Promise<number> {
    const result = await this.database.execute(sql`
      INSERT INTO ${keyValueEntries} (key, value, expires_at)
      VALUES (${key}, ${String(increment)}, NULL)
      ON CONFLICT (key) DO UPDATE SET
        value = CASE
          WHEN expires_at <= now() THEN ${String(increment)}
          ELSE (value::bigint + ${increment})::text
        END,
        expires_at = CASE
          WHEN expires_at <= now() THEN NULL
          ELSE expires_at
        END
      WHERE expires_at <= now()
         OR (value::numeric + ${increment})
              BETWEEN ${Number.MIN_SAFE_INTEGER} AND ${Number.MAX_SAFE_INTEGER}
      RETURNING value
    `)
    const value = rows<{ value: string }>(result)[0]?.value
    if (value === undefined)
      throw new RangeError('result must be a safe integer')
    const parsed = Number(value)
    validateInteger(parsed, 'result')
    return parsed
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (seconds <= 0) return (await this.del([key])) === 1
    const updated = await this.database
      .update(keyValueEntries)
      .set({ expiresAt: new Date(Date.now() + seconds * 1_000) })
      .where(and(eq(keyValueEntries.key, key), liveEntry()))
      .returning({ key: keyValueEntries.key })
    return updated.length > 0
  }

  async persist(key: string): Promise<boolean> {
    const updated = await this.database
      .update(keyValueEntries)
      .set({ expiresAt: null })
      .where(
        and(
          eq(keyValueEntries.key, key),
          gt(keyValueEntries.expiresAt, sql`now()`),
        ),
      )
      .returning({ key: keyValueEntries.key })
    return updated.length > 0
  }

  async ttl(key: string): Promise<number> {
    const result = await this.database.execute(sql`
      SELECT CASE
        WHEN expires_at IS NULL THEN -1
        ELSE CEIL(EXTRACT(EPOCH FROM (expires_at - now())))::integer
      END AS ttl
      FROM ${keyValueEntries}
      WHERE key = ${key} AND (expires_at IS NULL OR expires_at > now())
    `)
    const ttl = rows<{ ttl: number }>(result)[0]?.ttl
    return ttl === undefined ? -2 : Number(ttl)
  }

  async ping(): Promise<void> {
    await this.database.execute(sql`SELECT 1`)
  }
}

function liveEntry() {
  return or(
    isNull(keyValueEntries.expiresAt),
    gt(keyValueEntries.expiresAt, sql`now()`),
  )
}

function rows<T>(result: unknown): T[] {
  return result as T[]
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
