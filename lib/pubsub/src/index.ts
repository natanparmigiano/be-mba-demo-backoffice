import { getRedisUrl } from './env.js'
import { MemoryPubSub } from './memory.js'
import { RedisPubSub } from './redis.js'
import type { PubSub } from './types.js'

export function createPubSub(redisUrl = getRedisUrl()): PubSub {
  return redisUrl ? new RedisPubSub(redisUrl) : new MemoryPubSub()
}

export const pubsub = createPubSub()

export { getRedisUrl } from './env.js'
export { MemoryPubSub } from './memory.js'
export { RedisPubSub } from './redis.js'
export type {
  PubSub,
  PubSubHandler,
  PubSubMessage,
  PubSubMode,
  Unsubscribe,
} from './types.js'
