import { EventEmitter } from 'node:events'
import { KafkaJS } from '@confluentinc/kafka-javascript'
import { validateTopic } from './memory.js'
import type { KafkaConfiguration } from './env.js'
import type {
  EventBus,
  EventHandler,
  EventHeaders,
  EventMessage,
  PublishOptions,
  Unsubscribe,
} from './types.js'

export class KafkaEventBus implements EventBus {
  readonly mode = 'kafka' as const

  private readonly emitter = new EventEmitter()
  private readonly admin: KafkaJS.Admin
  private readonly producer: KafkaJS.Producer
  private readonly consumer: KafkaJS.Consumer
  private startPromise: Promise<void> | undefined
  private started = false
  private closed = false

  constructor(configuration: KafkaConfiguration) {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: {
        clientId: configuration.clientId,
        brokers: configuration.brokers,
        logLevel: KafkaJS.logLevel.WARN,
      },
    })

    this.admin = kafka.admin()
    this.producer = kafka.producer()
    this.consumer = kafka.consumer({
      kafkaJS: {
        groupId: configuration.groupId,
        fromBeginning: false,
        autoCommit: true,
        autoCommitInterval: 5_000,
      },
    })
  }

  subscribe(topic: string, handler: EventHandler): Unsubscribe {
    validateTopic(topic)
    this.assertOpen()

    if (this.started || this.startPromise) {
      throw new Error(
        'Subscriptions must be registered before the event bus starts',
      )
    }

    // EventEmitter is used as a handler registry; initialize() awaits each handler.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.emitter.on(topic, handler)
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.emitter.off(topic, handler)
    }
  }

  async start(): Promise<void> {
    this.assertOpen()
    this.startPromise ??= this.initialize().catch((error: unknown) => {
      this.startPromise = undefined
      throw error
    })

    await this.startPromise
  }

  async publish(
    topic: string,
    value: string,
    options: PublishOptions = {},
  ): Promise<void> {
    validateTopic(topic)
    await this.start()

    await this.producer.send({
      topic,
      messages: [
        {
          value,
          key: options.key,
          headers: options.headers,
          timestamp: String(Date.now()),
        },
      ],
    })
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true

    if (this.started) {
      await Promise.all([
        this.consumer.disconnect(),
        this.producer.disconnect(),
      ])
    }

    this.emitter.removeAllListeners()
  }

  private async initialize(): Promise<void> {
    await this.producer.connect()

    const topics = this.emitter.eventNames().map(String)

    if (topics.length > 0) {
      await this.admin.connect()

      try {
        const existingTopics = await this.admin.listTopics()
        const missingTopics = getMissingTopics(topics, existingTopics)

        if (missingTopics.length > 0) {
          await this.admin.createTopics({
            topics: missingTopics.map((topic) => ({ topic })),
          })
        }
      } finally {
        await this.admin.disconnect()
      }

      await this.consumer.connect()

      await this.consumer.subscribe({ topics })

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          const event: EventMessage = {
            topic,
            value: message.value?.toString() ?? '',
            key: message.key?.toString() ?? null,
            headers: decodeHeaders(message.headers),
            timestamp: Number(message.timestamp),
          }
          const handlers = this.emitter.listeners(topic) as EventHandler[]

          await Promise.all(
            handlers.map((handler) => Promise.resolve(handler(event))),
          )
        },
      })
    }

    this.started = true
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Event bus is closed')
  }
}

export function getMissingTopics(
  requiredTopics: readonly string[],
  existingTopics: readonly string[],
): string[] {
  const existing = new Set(existingTopics)
  return requiredTopics.filter((topic) => !existing.has(topic))
}

function decodeHeaders(
  headers: Record<
    string,
    Buffer | string | (Buffer | string)[] | undefined
  > = {},
): EventHeaders {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (value === undefined) return []
      const firstValue = Array.isArray(value) ? value[0] : value
      return firstValue === undefined ? [] : [[key, firstValue.toString()]]
    }),
  )
}
