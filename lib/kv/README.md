# `@mba-demo/kv`

Use this string key/value interface for Redis-style application and Better Auth
secondary storage. Set `REDIS_URL` for shared, durable-enough coordination
across app instances; without it, every process receives an isolated,
non-durable memory store.

## Adapter selection

`createKeyValueStore()` uses Redis when `REDIS_URL` is present and the memory adapter otherwise. Valid configured URLs must use `redis://` or `rediss://`.

```ts
import { kv } from '@mba-demo/kv'

await kv.set('example', 'value', { ttlSeconds: 60 })
const value = await kv.get('example')
await kv.close()
```

The module-level `kv` export is created from the process environment. `createKeyValueStore()`, `MemoryKeyValueStore`, and `RedisKeyValueStore` are also exported for explicit construction and testing.

## Supported operations

| Category      | Operations                              |
| ------------- | --------------------------------------- |
| Read/write    | `get`, `getDel`, `set`, `del`, `exists` |
| Multiple keys | `mGet`, `mSet`                          |
| Counters      | `incr`, `incrBy`, `decr`, `decrBy`      |
| Expiration    | `expire`, `persist`, `ttl`              |
| Lifecycle     | `ping`, `close`                         |

`set` supports:

- `condition: 'if-exists'`, equivalent to Redis `XX`.
- `condition: 'if-not-exists'`, equivalent to Redis `NX`.
- A positive integer `ttlSeconds`, equivalent to Redis `EX`.

`ttl()` follows Redis return values: `-2` means the key does not exist and `-1` means the key exists without expiration. Counter inputs and stored counter values must be safe integers.

## Adapter behavior

The Redis client connects lazily on the first operation, shares concurrent connection attempts, logs client errors, and closes only when open.

The memory adapter stores strings in a `Map` and lazily removes expired entries.
It matches the exposed Redis semantics, including conditional writes and TTL
preservation during counter changes, but cannot persist or share values across
processes.

Better Auth uses this package for secondary storage. Full Compose configures Redis, while simple Compose keeps auth secondary data inside the app process.

## Verification

```bash
yarn workspace @mba-demo/kv typecheck
yarn workspace @mba-demo/kv test
yarn workspace @mba-demo/kv build
```

Tests cover environment validation, adapter selection without eager Redis connections, conditional writes, multi-key operations, atomic read-and-delete, expiration, persistence, and counters.
