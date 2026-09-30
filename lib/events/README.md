# `@mba-demo/events`

A small event-bus abstraction with interchangeable Kafka and in-memory implementations. Application code uses one interface for publishing, subscribing, startup, and shutdown.

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
import { events } from '@mba-demo/events'

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

The Kafka adapter connects its producer during startup. When subscribers exist, it creates missing topics, connects the consumer, subscribes to each registered topic, and begins the message loop. Publishing also starts an unstarted producer, which allows API-only processes to publish without registering consumers.

KafkaJS 2.2.4 has an open Node.js 24 request-queue bug that passes a negative delay to `setTimeout`. The repository's root `postinstall` script applies the narrow upstream fix after every dependency installation. Dependency upgrades must be checked against `scripts/patch-kafkajs.mjs`; installation fails intentionally if the expected KafkaJS source no longer matches.

The memory adapter uses Node's `EventEmitter`. It preserves the same message shape and awaits handlers, but events never leave the process, are not replayed, and disappear on restart. It is therefore suitable only when publisher and subscribers share one process.

## Worker integration

The event library does not decide which application handlers run. `apps/api/src/subscribers.ts` owns the handler registry, and the API's app or worker entrypoint registers the selected topics before starting this library.

## Verification

```bash
yarn workspace @mba-demo/events typecheck
yarn workspace @mba-demo/events test
yarn workspace @mba-demo/events build
```

Unit tests cover adapter selection and in-memory delivery. The full Compose smoke path exercises Kafka across separate app and worker containers.
