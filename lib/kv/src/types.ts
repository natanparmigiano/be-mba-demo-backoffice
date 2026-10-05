export type SetCondition = 'if-exists' | 'if-not-exists'
export type KeyValueMode = 'memory' | 'postgres' | 'redis'

export interface SetOptions {
  condition?: SetCondition
  ttlSeconds?: number
}

export interface KeyValueStore {
  readonly mode: KeyValueMode
  get(key: string): Promise<string | null>
  getDel(key: string): Promise<string | null>
  set(key: string, value: string, options?: SetOptions): Promise<boolean>
  del(...keys: string[]): Promise<number>
  exists(...keys: string[]): Promise<number>
  mGet(keys: string[]): Promise<Array<string | null>>
  mSet(entries: Readonly<Record<string, string>>): Promise<void>
  incr(key: string): Promise<number>
  incrBy(key: string, increment: number): Promise<number>
  decr(key: string): Promise<number>
  decrBy(key: string, decrement: number): Promise<number>
  expire(key: string, seconds: number): Promise<boolean>
  persist(key: string): Promise<boolean>
  ttl(key: string): Promise<number>
  ping(): Promise<'PONG'>
  close(): Promise<void>
}
