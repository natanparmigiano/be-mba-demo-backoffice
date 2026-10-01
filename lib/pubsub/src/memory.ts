import { EventEmitter } from 'node:events'
import type {
  PubSub,
  PubSubHandler,
  PubSubMessage,
  Unsubscribe,
} from './types.js'
import { validateChannel } from './validation.js'

export class MemoryPubSub implements PubSub {
  readonly mode = 'memory' as const

  // Fan-out channels can legitimately have many simultaneous SSE listeners.
  private readonly emitter = new EventEmitter().setMaxListeners(0)
  private started = false
  private closed = false

  async subscribe(
    channel: string,
    handler: PubSubHandler,
  ): Promise<Unsubscribe> {
    validateChannel(channel)
    this.assertOpen()
    // EventEmitter is used as a handler registry; publish() awaits each handler.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.emitter.on(channel, handler)

    return async () => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.emitter.off(channel, handler)
    }
  }

  async start(): Promise<void> {
    this.assertOpen()
    this.started = true
  }

  async publish(channel: string, value: string): Promise<void> {
    validateChannel(channel)
    this.assertOpen()
    if (!this.started) await this.start()

    const message: PubSubMessage = { channel, value }
    const handlers = this.emitter.listeners(channel) as PubSubHandler[]

    await Promise.all(
      handlers.map((handler) => Promise.resolve(handler(message))),
    )
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.emitter.removeAllListeners()
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Pub/sub is closed')
  }
}
