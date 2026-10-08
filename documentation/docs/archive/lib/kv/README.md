# `@mba-desk/kv`

Use this string key/value interface for Redis-style application and Better Auth
secondary storage. Redis is selected automatically when `REDIS_URL` is set;
without Redis configuration the default is PostgreSQL. Process-local memory is
available explicitly with `KV_ADAPTER=memory`.

## Quick start

Use the default PostgreSQL adapter for durable local setup, Redis for shared
high-throughput deployments, or explicit memory mode only in one process.
Import the public store and close it during shutdown.

## Adapter selection

`KV_ADAPTER` accepts `memory`, `postgres`, or `redis`. When it is unset,
`createKeyValueStore()` uses Redis if `REDIS_URL` is present and PostgreSQL
otherwise. Explicit Redis mode requires a valid `redis://` or `rediss://` URL.

```ts
import { kv } from '@mba-desk/kv'

await kv.set('example', 'value', { ttlSeconds: 60 })
const value = await kv.get('example')
await kv.close()
```

The module-level `kv` export is created from the process environment.
`createKeyValueStore()`, `MemoryKeyValueStore`, `PostgresKeyValueStore`, and
`RedisKeyValueStore` are also exported for explicit construction and testing.

## Supported operations

| Category      | Operations                                             |
| ------------- | ------------------------------------------------------ |
| Read/write    | `get`, `getDel`, `set`, `del`, `exists`                |
| Multiple keys | `mGet`, `mSet`                                         |
| Counters      | `incr`, `incrBy`, `incrementWithTtl`, `decr`, `decrBy` |
| Expiration    | `expire`, `persist`, `ttl`                             |
| Lifecycle     | `ping`, `close`                                        |

`set` supports:

- `condition: 'if-exists'`, equivalent to Redis `XX`.
- `condition: 'if-not-exists'`, equivalent to Redis `NX`.
- A positive integer `ttlSeconds`, equivalent to Redis `EX`.

`ttl()` follows Redis return values: `-2` means the key does not exist and `-1` means the key exists without expiration. Counter inputs and stored counter values must be safe integers.

## Adapter behavior

The Redis client connects lazily on the first operation, shares concurrent connection attempts, logs client errors, and closes only when open.

The PostgreSQL adapter stores values and expiration timestamps in `kv.entries`.
Its atomic operations run in PostgreSQL, so multiple replicas can share it.
`close()` is a no-op because the application owns the database lifecycle.

`incrementWithTtl()` implements fixed-window counters atomically: a missing,
expired, or legacy non-expiring counter starts at `1` with the requested TTL;
later increments preserve the original expiration. Better Auth uses this
operation for rate limiting.

The memory adapter stores strings in a `Map` and lazily removes expired entries.
It matches the exposed Redis semantics, including conditional writes and TTL
preservation during counter changes, but cannot persist or share values across
processes.

Better Auth uses this package for secondary storage. Full Compose configures
Redis, while Simple Compose explicitly selects process-local memory.

## Verification

```bash
yarn workspace @mba-desk/kv typecheck
yarn workspace @mba-desk/kv test
yarn workspace @mba-desk/kv build
```

Tests cover environment validation, adapter selection without eager external
connections, conditional writes, multi-key operations, atomic read-and-delete,
expiration, persistence, and counters.
