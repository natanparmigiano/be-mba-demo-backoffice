# `@mba-desk/pubsub`

Use this package for transient, fan-out messages that every active subscriber
should receive. It uses Redis Pub/Sub when `REDIS_URL` is configured and falls
back to a process-local Node.js `EventEmitter` when Redis is absent.

Redis Pub/Sub is intentionally non-durable: messages are not stored, replayed,
or retried for disconnected subscribers. Use `@mba-desk/events` and Kafka when
you need consumer groups, durable delivery, or replay.

## Adapter selection

`createPubSub()` selects Redis for `redis://` and `rediss://` URLs and otherwise
creates a `MemoryPubSub`. The module-level `pubsub` export uses `REDIS_URL` from
the current process environment.

The Redis adapter creates separate publisher and subscriber clients because a
connection in Redis subscriber mode cannot execute ordinary commands. Both
connections are lazy; the subscriber connection remains unopened when no
handlers are registered.

## Public interface

```ts
interface PubSub {
  readonly mode: 'redis' | 'memory'
  subscribe(channel: string, handler: PubSubHandler): Promise<Unsubscribe>
  start(): Promise<void>
  publish(channel: string, value: string): Promise<void>
  close(): Promise<void>
}
```

Messages contain the exact channel and a string value. Handlers may be
synchronous or asynchronous.

```ts
import { pubsub } from '@mba-desk/pubsub'

const unsubscribe = await pubsub.subscribe('chat.updated', async (message) => {
  console.log(message.channel, message.value)
})

await pubsub.start()
await pubsub.publish('chat.updated', JSON.stringify({ chatId: 42 }))

await unsubscribe()
await pubsub.close()
```

## Lifecycle and delivery

- Subscriptions can be added and removed before or after the adapter starts.
- Redis subscribes to an exact channel while it has at least one local handler
  and unsubscribes when the last handler is removed.
- `publish()` starts an unstarted adapter automatically.
- The memory adapter awaits all local handlers before `publish()` resolves.
- Redis publishing only confirms that Redis accepted the message; remote
  handler completion cannot be observed by the publisher.
- Handler failures received from Redis are logged because there is no publisher
  call to reject.
- `close()` is idempotent, and a closed adapter cannot be restarted.
- Memory mode is isolated to one process and loses every message on restart.

## Verification

```bash
yarn workspace @mba-desk/pubsub typecheck
yarn workspace @mba-desk/pubsub test
yarn workspace @mba-desk/pubsub build
```

Unit tests cover environment selection, lifecycle behavior, memory delivery,
lazy Redis clients, and the dedicated publisher/subscriber connection split
without requiring a live Redis service.
