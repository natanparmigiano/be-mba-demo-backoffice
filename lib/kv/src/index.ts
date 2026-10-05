import { getKeyValueConfiguration } from './env.js'
import { MemoryKeyValueStore } from './memory.js'
import { PostgresKeyValueStore } from './postgres.js'
import { RedisKeyValueStore } from './redis.js'
import type { KeyValueStore } from './types.js'

export function createKeyValueStore(
  configuration = getKeyValueConfiguration(),
): KeyValueStore {
  if (configuration.adapter === 'postgres') return new PostgresKeyValueStore()
  if (configuration.adapter === 'redis') {
    if (!configuration.redisUrl) {
      throw new Error('REDIS_URL is required when KV_ADAPTER is redis')
    }
    return new RedisKeyValueStore(configuration.redisUrl)
  }
  return new MemoryKeyValueStore()
}

export const kv = createKeyValueStore()

export { getKeyValueConfiguration, getRedisUrl } from './env.js'
export { MemoryKeyValueStore } from './memory.js'
export { PostgresKeyValueStore } from './postgres.js'
export { RedisKeyValueStore } from './redis.js'
export type { KeyValueAdapter, KeyValueConfiguration } from './env.js'
export type {
  KeyValueMode,
  KeyValueStore,
  SetCondition,
  SetOptions,
} from './types.js'
