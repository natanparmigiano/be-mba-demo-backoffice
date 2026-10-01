import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryPubSub } from './memory.js'

describe('MemoryPubSub', () => {
  it('delivers a message to every channel subscriber', async () => {
    const bus = new MemoryPubSub()
    const received: string[] = []

    await bus.subscribe('chat.updated', (message) => {
      received.push(`${message.channel}:${message.value}`)
    })
    await bus.subscribe('chat.updated', async (message) => {
      await Promise.resolve()
      received.push(message.value.toUpperCase())
    })

    await bus.publish('chat.updated', 'hello')

    assert.deepEqual(received, ['chat.updated:hello', 'HELLO'])
    await bus.close()
  })

  it('supports subscribing and unsubscribing after startup', async () => {
    const bus = new MemoryPubSub()
    let deliveries = 0
    await bus.start()
    const unsubscribe = await bus.subscribe('chat.updated', () => {
      deliveries += 1
    })

    await bus.publish('chat.updated', 'first')
    await unsubscribe()
    await bus.publish('chat.updated', 'hello')

    assert.equal(deliveries, 1)
    await bus.close()
  })

  it('rejects empty channels and use after close', async () => {
    const bus = new MemoryPubSub()

    await assert.rejects(
      () => bus.subscribe('  ', () => undefined),
      /channel cannot be empty/,
    )

    await bus.close()
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
})
