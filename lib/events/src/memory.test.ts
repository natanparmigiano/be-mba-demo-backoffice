import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryEventBus } from './memory.js'

describe('MemoryEventBus', () => {
  it('delivers the same envelope to all topic subscribers', async () => {
    const bus = new MemoryEventBus()
    const received: string[] = []

    bus.subscribe('demo.events.v1', (event) => {
      received.push(`${event.key}:${event.value}:${event.headers.source}`)
    })
    bus.subscribe('demo.events.v1', (event) => {
      received.push(event.topic)
    })

    await bus.start()
    await bus.publish('demo.events.v1', 'hello', {
      key: 'message-1',
      headers: { source: 'test' },
    })

    assert.deepEqual(received, ['message-1:hello:test', 'demo.events.v1'])
    await bus.close()
  })

  it('rejects late subscriptions and use after close', async () => {
    const bus = new MemoryEventBus()

    await bus.start()
    assert.throws(
      () => bus.subscribe('topic', () => undefined),
      /before the event bus starts/,
    )

    await bus.close()
    await assert.rejects(
      () => bus.publish('topic', 'value'),
      /Event bus is closed/,
    )
  })
})
