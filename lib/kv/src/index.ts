import { getRedisUrl } from './env.js'
import { MemoryKeyValueStore } from './memory.js'
import { RedisKeyValueStore } from './redis.js'
import type { KeyValueStore } from './types.js'

export function createKeyValueStore(redisUrl = getRedisUrl()): KeyValueStore {
  return redisUrl ? new RedisKeyValueStore(redisUrl) : new MemoryKeyValueStore()
}

export const kv = createKeyValueStore()

export { getRedisUrl } from './env.js'
export { MemoryKeyValueStore } from './memory.js'
export { RedisKeyValueStore } from './redis.js'
export type {
  KeyValueMode,
  KeyValueStore,
  SetCondition,
  SetOptions,
} from './types.js'
