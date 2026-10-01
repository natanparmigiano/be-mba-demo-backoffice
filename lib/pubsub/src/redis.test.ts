import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RedisPubSub,
  type RedisPubSubClient,
  type RedisPubSubClientFactory,
} from './redis.js'

class FakeRedisClient implements RedisPubSubClient {
  isOpen = false
  connectCalls = 0
  closeCalls = 0
  readonly publications: Array<{ channel: string; value: string }> = []
  readonly subscriptions = new Map<
    string,
    (message: string, channel: string) => void
  >()
  readonly unsubscriptions: string[] = []

  async connect(): Promise<void> {
    this.connectCalls += 1
    this.isOpen = true
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    this.isOpen = false
  }

  onError(): void {}

  async publish(channel: string, value: string): Promise<number> {
    this.publications.push({ channel, value })
    return 1
  }

  async subscribe(
    channels: readonly string[],
    listener: (message: string, channel: string) => void,
  ): Promise<void> {
    for (const channel of channels) this.subscriptions.set(channel, listener)
  }

  async unsubscribe(channels: readonly string[]): Promise<void> {
    for (const channel of channels) {
      this.subscriptions.delete(channel)
      this.unsubscriptions.push(channel)
    }
  }

  emit(channel: string, value: string): void {
    this.subscriptions.get(channel)?.(value, channel)
  }
}

function createFakeClients(): {
  clients: FakeRedisClient[]
  factory: RedisPubSubClientFactory
} {
  const clients: FakeRedisClient[] = []

  return {
    clients,
    factory: () => {
      const client = new FakeRedisClient()
      clients.push(client)
      return client
    },
  }
}

describe('RedisPubSub', () => {
  it('uses separate lazy publisher and subscriber connections', async () => {
    const { clients, factory } = createFakeClients()
    const bus = new RedisPubSub('redis://localhost:6379', factory)
    const received: string[] = []

    const unsubscribe = await bus.subscribe('chat.updated', (message) => {
      received.push(`${message.channel}:${message.value}`)
    })

    assert.equal(clients.length, 2)
    assert.deepEqual(
      clients.map((client) => client.connectCalls),
      [0, 0],
    )

    await bus.start()

    assert.deepEqual(
      clients.map((client) => client.connectCalls),
      [1, 1],
    )
    assert.deepEqual([...clients[1]!.subscriptions.keys()], ['chat.updated'])

    await bus.publish('chat.updated', 'published')
    assert.deepEqual(clients[0]!.publications, [
      { channel: 'chat.updated', value: 'published' },
    ])

    clients[1]!.emit('chat.updated', 'received')
    assert.deepEqual(received, ['chat.updated:received'])

    await unsubscribe()
    assert.deepEqual(clients[1]!.unsubscriptions, ['chat.updated'])

    await bus.close()
    assert.deepEqual(
      clients.map((client) => client.closeCalls),
      [1, 1],
    )
  })

  it('does not open the subscriber connection without handlers', async () => {
    const { clients, factory } = createFakeClients()
    const bus = new RedisPubSub('redis://localhost:6379', factory)

    await bus.publish('chat.updated', 'hello')

    assert.deepEqual(
      clients.map((client) => client.connectCalls),
      [1, 0],
    )
    await bus.close()
    assert.deepEqual(
      clients.map((client) => client.closeCalls),
      [1, 0],
    )
  })

  it('supports late subscriptions and use after close', async () => {
    const { clients, factory } = createFakeClients()
    const bus = new RedisPubSub('redis://localhost:6379', factory)

    await bus.start()
    const unsubscribe = await bus.subscribe('chat.updated', () => undefined)
    assert.deepEqual([...clients[1]!.subscriptions.keys()], ['chat.updated'])
    await unsubscribe()

    await bus.close()
    await assert.rejects(
      () => bus.subscribe('chat.updated', () => undefined),
      /Pub\/sub is closed/,
    )
    await assert.rejects(
      () => bus.publish('chat.updated', 'hello'),
      /Pub\/sub is closed/,
    )
  })

  it('keeps a Redis channel subscribed until its last handler leaves', async () => {
    const { clients, factory } = createFakeClients()
    const bus = new RedisPubSub('redis://localhost:6379', factory)
    await bus.start()

    const unsubscribeFirst = await bus.subscribe('chats.31', () => undefined)
    const unsubscribeSecond = await bus.subscribe('chats.31', () => undefined)

    await unsubscribeFirst()
    assert.deepEqual(clients[1]!.unsubscriptions, [])
    await unsubscribeSecond()
    assert.deepEqual(clients[1]!.unsubscriptions, ['chats.31'])
    await bus.close()
  })
})
