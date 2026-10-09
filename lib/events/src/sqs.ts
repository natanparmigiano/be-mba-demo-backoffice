import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs'
import type { SqsConfiguration } from './env.js'
import { validateTopic } from './memory.js'
import type {
  EventBus,
  EventHandler,
  EventMessage,
  PublishOptions,
  Unsubscribe,
} from './types.js'

interface SqsClientLike {
  send(
    command: unknown,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown>
  destroy(): void
}

interface SqsEnvelope {
  headers: Readonly<Record<string, string>>
  key: string | null
  timestamp: number
  topic: string
  value: string
}

export class SqsEventBus implements EventBus {
  readonly mode = 'sqs' as const

  private readonly emitter = new EventEmitter()
  private readonly client: SqsClientLike
  private readonly abortController = new AbortController()
  private pollPromise: Promise<void> | undefined
  private started = false
  private closed = false

  constructor(
    private readonly configuration: SqsConfiguration,
    client?: SqsClientLike,
  ) {
    this.client =
      client ??
      new SQSClient({
        region: configuration.region,
        endpoint: configuration.endpoint,
      })
  }

  subscribe(topic: string, handler: EventHandler): Unsubscribe {
    validateTopic(topic)
    this.assertOpen()
    if (this.started) {
      throw new Error(
        'Subscriptions must be registered before the event bus starts',
      )
    }
    // EventEmitter is used only as the local handler registry.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.emitter.on(topic, handler)
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.emitter.off(topic, handler)
    }
  }

  async start(): Promise<void> {
    this.assertOpen()
    if (this.started) return
    this.started = true
    if (this.emitter.eventNames().length > 0) {
      this.pollPromise = this.poll()
    }
  }

  async publish(
    topic: string,
    value: string,
    options: PublishOptions = {},
  ): Promise<void> {
    validateTopic(topic)
    await this.start()
    const envelope: SqsEnvelope = {
      topic,
      value,
      key: options.key ?? null,
      headers: { ...options.headers },
      timestamp: Date.now(),
    }
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.configuration.queueUrl,
        MessageBody: JSON.stringify(envelope),
        MessageGroupId: createMessageGroupId(options.key || topic),
        MessageDeduplicationId: randomUUID(),
      }),
    )
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.abortController.abort()
    await this.pollPromise
    this.client.destroy()
    this.emitter.removeAllListeners()
  }

  private async poll(): Promise<void> {
    while (!this.closed) {
      try {
        const response = (await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.configuration.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
          }),
          { abortSignal: this.abortController.signal },
        )) as { Messages?: Message[] }

        for (const message of response.Messages ?? []) {
          if (this.closed) return
          await this.handleMessage(message)
        }
      } catch (error) {
        if (this.closed && isAbortError(error)) return
        await waitForRetry(this.abortController.signal)
      }
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    const event = parseEnvelope(message.Body)
    const handlers = this.emitter.listeners(event.topic) as EventHandler[]
    if (handlers.length === 0) {
      throw new Error(
        `No subscriber is registered for SQS event topic: ${event.topic}`,
      )
    }
    await Promise.all(
      handlers.map((handler) => Promise.resolve(handler(event))),
    )
    if (!message.ReceiptHandle)
      throw new Error('SQS message has no receipt handle')
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.configuration.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    )
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Event bus is closed')
  }
}

function parseEnvelope(body: string | undefined): EventMessage {
  if (!body) throw new Error('SQS event message has no body')
  const value = JSON.parse(body) as Partial<SqsEnvelope>
  if (
    typeof value.topic !== 'string' ||
    typeof value.value !== 'string' ||
    typeof value.timestamp !== 'number' ||
    (value.key !== null && typeof value.key !== 'string') ||
    !isStringRecord(value.headers)
  ) {
    throw new Error('SQS event message has an invalid envelope')
  }
  validateTopic(value.topic)
  return value as EventMessage
}

function isStringRecord(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function createMessageGroupId(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function waitForRetry(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timeout)
      resolve()
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 1_000)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
