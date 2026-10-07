# `@mba-desk/events`

Use one event-bus interface for publishing, subscription, startup, and
shutdown. Configure Kafka whenever publishers and subscribers run in different
processes; the memory adapter is process-local, non-durable, and cannot replay
events.

Register every subscriber before `start()`, and treat an adapter as permanently
closed after `close()`.

## Adapter selection

`createEventBus()` selects Kafka only when both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS` are set. When neither is set, it creates a `MemoryEventBus`. Providing only one Kafka variable fails immediately.

| Variable          | Description                                        |
| ----------------- | -------------------------------------------------- |
| `KAFKA_CLIENT_ID` | Kafka client identifier                            |
| `KAFKA_BROKERS`   | Comma-separated broker addresses                   |
| `KAFKA_GROUP_ID`  | Consumer group; defaults to `<client-id>-consumer` |

The module-level `events` export is created from the current process environment.

## Public interface

```ts
interface EventBus {
  readonly mode: 'kafka' | 'memory'
  subscribe(topic: string, handler: EventHandler): Unsubscribe
  start(): Promise<void>
  publish(topic: string, value: string, options?: PublishOptions): Promise<void>
  close(): Promise<void>
}
```

Messages contain the topic, string value, optional key, string headers, and numeric timestamp. Handlers may be synchronous or asynchronous. Publishing awaits every in-memory handler; Kafka delivery to handlers occurs through the consumer loop.

Example:

```ts
import { events } from '@mba-desk/events'

const unsubscribe = events.subscribe('orders.created.v1', async (event) => {
  console.log(event.key, event.value)
})

await events.start()
await events.publish('orders.created.v1', JSON.stringify({ orderId: 42 }), {
  key: '42',
  headers: { source: 'api' },
})

unsubscribe()
await events.close()
```

## Lifecycle rules

- Register every subscriber before calling `start()` or publishing.
- Topic names cannot be empty.
- Call `close()` during graceful shutdown.
- Treat an adapter instance as closed permanently after `close()`.

The Kafka adapter uses Confluent's KafkaJS-compatible API backed by
`librdkafka`. It connects its producer during startup. When subscribers exist,
it creates missing topics, connects the consumer, subscribes to each registered
topic, and begins the message loop. Publishing also starts an unstarted
producer, which allows API-only processes to publish without registering
consumers. Consumer offsets are committed automatically every five seconds
after successful handler processing, so handlers must tolerate redelivery
after an abrupt process exit.

The Confluent package installs a platform-specific native binary. Supported
Node.js and container platforms use its published prebuilt binaries; other
platforms require the documented C++ and `librdkafka` build toolchain.

The memory adapter uses Node's `EventEmitter` and awaits every handler while
preserving the Kafka message shape. Use it only when the publisher and all
subscribers share one process; events disappear on restart and are never
replayed.

## Worker integration

The event library does not decide which application handlers run. `apps/api/src/subscribers.ts` owns the handler registry, and the API's app or worker entrypoint registers the selected topics before starting this library.

Runner calls publish `runner.execution.requested.v1` with a versioned payload
containing only the durable execution-log ID. The subscriber atomically claims
the queued PostgreSQL row and executes it through `@mba-desk/runner`. Memory
mode therefore requires the in-process worker; separate API and worker
processes require Kafka.

## Verification

```bash
yarn workspace @mba-desk/events typecheck
yarn workspace @mba-desk/events test
yarn workspace @mba-desk/events build
```

Unit tests cover adapter selection and in-memory delivery. The full Compose smoke path exercises Kafka across separate app and worker containers.
