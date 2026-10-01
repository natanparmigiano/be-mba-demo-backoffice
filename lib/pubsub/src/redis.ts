import { EventEmitter } from 'node:events'
import { createClient } from 'redis'
import type {
  PubSub,
  PubSubHandler,
  PubSubMessage,
  Unsubscribe,
} from './types.js'
import { validateChannel } from './validation.js'

type RedisMessageListener = (message: string, channel: string) => void

export interface RedisPubSubClient {
  readonly isOpen: boolean
  close(): Promise<void>
  connect(): Promise<void>
  onError(listener: (error: Error) => void): void
  publish(channel: string, value: string): Promise<number>
  subscribe(
    channels: readonly string[],
    listener: RedisMessageListener,
  ): Promise<void>
  unsubscribe(channels: readonly string[]): Promise<void>
}

export type RedisPubSubClientFactory = (url: string) => RedisPubSubClient

export class RedisPubSub implements PubSub {
  readonly mode = 'redis' as const

  // Fan-out channels can legitimately have many simultaneous SSE listeners.
  private readonly emitter = new EventEmitter().setMaxListeners(0)
  private readonly publisher: RedisPubSubClient
  private readonly subscriber: RedisPubSubClient
  private startPromise: Promise<void> | undefined
  private subscriptionQueue: Promise<void> = Promise.resolve()
  private readonly subscribedChannels = new Set<string>()
  private started = false
  private closed = false

  constructor(
    url: string,
    createRedisClient: RedisPubSubClientFactory = createNodeRedisClient,
  ) {
    this.publisher = createRedisClient(url)
    this.subscriber = createRedisClient(url)
    this.publisher.onError((error) => {
      console.error('Redis pub/sub publisher error', error)
    })
    this.subscriber.onError((error) => {
      console.error('Redis pub/sub subscriber error', error)
    })
  }

  async subscribe(
    channel: string,
    handler: PubSubHandler,
  ): Promise<Unsubscribe> {
    validateChannel(channel)
    this.assertOpen()

    // EventEmitter is used only as the local handler registry.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.emitter.on(channel, handler)
    try {
      if (this.started || this.startPromise) {
        await this.start()
        this.assertOpen()
        await this.ensureSubscribed(channel)
      }
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.emitter.off(channel, handler)
      throw error
    }

    let active = true
    return async () => {
      if (!active) return
      active = false
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.emitter.off(channel, handler)
      if (this.closed) return
      if (this.emitter.listenerCount(channel) === 0) {
        await this.ensureUnsubscribed(channel)
      }
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

  async publish(channel: string, value: string): Promise<void> {
    validateChannel(channel)
    await this.start()
    await this.publisher.publish(channel, value)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true

    await this.subscriptionQueue

    if (this.startPromise) {
      try {
        await this.startPromise
      } catch {
        // Initialization already reported its failure to the caller.
      }
    }

    await Promise.all([
      closeIfOpen(this.subscriber),
      closeIfOpen(this.publisher),
    ])
    this.emitter.removeAllListeners()
  }

  private async initialize(): Promise<void> {
    await connectIfClosed(this.publisher)

    const channels = this.emitter.eventNames().map(String)

    if (channels.length > 0) {
      await connectIfClosed(this.subscriber)
      await this.subscriber.subscribe(channels, this.handleRedisMessage)
      for (const channel of channels) this.subscribedChannels.add(channel)
    }

    this.started = true
  }

  private async dispatch(message: PubSubMessage): Promise<void> {
    const handlers = this.emitter.listeners(message.channel) as PubSubHandler[]

    await Promise.all(
      handlers.map((handler) => Promise.resolve(handler(message))),
    )
  }

  private readonly handleRedisMessage: RedisMessageListener = (
    value,
    channel,
  ) => {
    void this.dispatch({ channel, value }).catch((error: unknown) => {
      console.error('Redis pub/sub handler error', error)
    })
  }

  private ensureSubscribed(channel: string): Promise<void> {
    return this.enqueueSubscriptionChange(async () => {
      if (this.subscribedChannels.has(channel)) return
      await connectIfClosed(this.subscriber)
      await this.subscriber.subscribe([channel], this.handleRedisMessage)
      this.subscribedChannels.add(channel)
    })
  }

  private ensureUnsubscribed(channel: string): Promise<void> {
    return this.enqueueSubscriptionChange(async () => {
      if (
        !this.subscribedChannels.has(channel) ||
        this.emitter.listenerCount(channel) > 0
      ) {
        return
      }
      await this.subscriber.unsubscribe([channel])
      this.subscribedChannels.delete(channel)
    })
  }

  private enqueueSubscriptionChange(
    operation: () => Promise<void>,
  ): Promise<void> {
    const result = this.subscriptionQueue.then(operation, operation)
    this.subscriptionQueue = result.catch(() => undefined)
    return result
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Pub/sub is closed')
  }
}

export function createNodeRedisClient(url: string): RedisPubSubClient {
  const client = createClient({ url })

  return {
    get isOpen() {
      return client.isOpen
    },
    async connect() {
      await client.connect()
    },
    async close() {
      await client.close()
    },
    onError(listener) {
      client.on('error', listener)
    },
    publish: (channel, value) => client.publish(channel, value),
    async subscribe(channels, listener) {
      await client.subscribe([...channels], listener)
    },
    async unsubscribe(channels) {
      await client.unsubscribe([...channels])
    },
  }
}

async function connectIfClosed(client: RedisPubSubClient): Promise<void> {
  if (!client.isOpen) await client.connect()
}

async function closeIfOpen(client: RedisPubSubClient): Promise<void> {
  if (client.isOpen) await client.close()
}
