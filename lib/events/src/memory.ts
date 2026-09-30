import { EventEmitter } from 'node:events'
import type {
  EventBus,
  EventHandler,
  EventMessage,
  PublishOptions,
  Unsubscribe,
} from './types.js'

export class MemoryEventBus implements EventBus {
  readonly mode = 'memory' as const

  private readonly emitter = new EventEmitter()
  private started = false
  private closed = false

  subscribe(topic: string, handler: EventHandler): Unsubscribe {
    validateTopic(topic)
    this.assertCanSubscribe()
    // EventEmitter is used as a handler registry; publish() awaits each handler.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.emitter.on(topic, handler)

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.emitter.off(topic, handler)
    }
  }

  async start(): Promise<void> {
    this.assertOpen()
    this.started = true
  }

  async publish(
    topic: string,
    value: string,
    options: PublishOptions = {},
  ): Promise<void> {
    validateTopic(topic)
    this.assertOpen()
    if (!this.started) await this.start()

    const message: EventMessage = {
      topic,
      value,
      key: options.key ?? null,
      headers: { ...options.headers },
      timestamp: Date.now(),
    }
    const handlers = this.emitter.listeners(topic) as EventHandler[]

    await Promise.all(
      handlers.map((handler) => Promise.resolve(handler(message))),
    )
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.emitter.removeAllListeners()
  }

  private assertCanSubscribe(): void {
    this.assertOpen()

    if (this.started) {
      throw new Error(
        'Subscriptions must be registered before the event bus starts',
      )
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Event bus is closed')
  }
}

export function validateTopic(topic: string): void {
  if (!topic.trim()) throw new Error('Event topic cannot be empty')
}
