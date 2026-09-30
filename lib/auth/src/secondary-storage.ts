import type { KeyValueStore } from '@mba-demo/kv'

export function createSecondaryStorage(store: KeyValueStore) {
  return {
    get: (key: string) => store.get(key),
    getAndDelete: (key: string) => store.getDel(key),
    set: async (key: string, value: string, ttl?: number) => {
      await store.set(
        key,
        value,
        ttl === undefined ? undefined : { ttlSeconds: ttl },
      )
    },
    delete: async (key: string) => {
      await store.del(key)
    },
    increment: (key: string) => store.incr(key),
  }
}
