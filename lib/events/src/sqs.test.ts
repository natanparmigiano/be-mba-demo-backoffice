import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs'
import { SqsEventBus } from './sqs.js'

class FakeSqsClient {
  readonly commands: unknown[] = []
  destroyed = false
  receiveCount = 0

  async send(
    command: unknown,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown> {
    this.commands.push(command)
    if (command instanceof ReceiveMessageCommand) {
      this.receiveCount += 1
      if (this.receiveCount === 1) {
        return {
          Messages: [
            {
              Body: JSON.stringify({
                headers: { source: 'test' },
                key: 'order-42',
                timestamp: 123,
                topic: 'orders.created.v1',
                value: '{"id":42}',
              }),
              ReceiptHandle: 'receipt-1',
            },
          ],
        }
      }
      await new Promise<void>((resolve) => {
        options?.abortSignal?.addEventListener('abort', () => resolve(), {
          once: true,
        })
      })
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }
    return {}
  }

  destroy(): void {
    this.destroyed = true
  }
}

const configuration = {
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/events.fifo',
  region: 'us-east-1',
}

describe('SqsEventBus', () => {
  it('publishes the event envelope with FIFO metadata', async () => {
    const client = new FakeSqsClient()
    const bus = new SqsEventBus(configuration, client)

    await bus.publish('orders.created.v1', '{"id":42}', {
      headers: { source: 'api' },
      key: 'order-42',
    })

    const command = client.commands[0]
    assert.ok(command instanceof SendMessageCommand)
    assert.equal(command.input.QueueUrl, configuration.queueUrl)
    assert.match(command.input.MessageGroupId ?? '', /^[a-f0-9]{64}$/)
    assert.ok(command.input.MessageDeduplicationId)
    const body = JSON.parse(command.input.MessageBody ?? '') as Record<
      string,
      unknown
    >
    assert.equal(typeof body.timestamp, 'number')
    delete body.timestamp
    assert.deepEqual(body, {
      headers: { source: 'api' },
      key: 'order-42',
      topic: 'orders.created.v1',
      value: '{"id":42}',
    })

    await bus.close()
    assert.equal(client.destroyed, true)
  })

  it('deletes a message only after delivering it to subscribers', async () => {
    const client = new FakeSqsClient()
    const bus = new SqsEventBus(configuration, client)
    const received: string[] = []
    bus.subscribe('orders.created.v1', (event) => {
      received.push(`${event.key}:${event.value}:${event.headers.source}`)
    })

    await bus.start()
    while (
      !client.commands.some((item) => item instanceof DeleteMessageCommand)
    ) {
      await new Promise((resolve) => setImmediate(resolve))
    }

    assert.deepEqual(received, ['order-42:{"id":42}:test'])
    await bus.close()
    assert.equal(client.destroyed, true)
  })

  it('rejects late subscriptions and use after close', async () => {
    const client = new FakeSqsClient()
    const bus = new SqsEventBus(configuration, client)
    await bus.start()
    assert.throws(
      () => bus.subscribe('orders.created.v1', () => undefined),
      /before the event bus starts/,
    )
    await bus.close()
    await assert.rejects(
      () => bus.publish('topic', 'value'),
      /Event bus is closed/,
    )
  })
})
