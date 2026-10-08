import { db, ingestWhatsAppWebhook, webhooks } from '@mba-desk/db'
import type {
  EventBus,
  EventHandler,
  EventMessage,
  Unsubscribe,
} from '@mba-desk/events'
import { pubsub, type PubSub } from '@mba-desk/pubsub'
import { whatsappWebhookSchema } from '@mba-desk/wa-webhooks'
import { z } from 'zod'
import {
  WA_CLOUD_WEBHOOK_FORWARD_TOPIC,
  WA_CLOUD_WEBHOOK_TOPIC,
} from './routes/wa-cloud.js'
import { archiveWhatsAppWebhookMedia } from './whatsapp-media.js'
import { publishChatRealtimeEventSafely } from './chat-realtime.js'
import {
  getSubscribedTopics,
  isWebhookArchiveEnabled,
  getWhatsAppWebhookMaxRetries,
} from './worker-config.js'

export const WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC =
  'wa-cloud.webhook.dead-letter.v1'

const RETRY_COUNT_HEADER = 'x-webhook-retry-count'
const ORIGINAL_TOPIC_HEADER = 'x-webhook-original-topic'
const FIRST_FAILED_AT_HEADER = 'x-webhook-first-failed-at'

export type SubscriberRegistry = Readonly<
  Record<string, readonly EventHandler[]>
>

type IngestWhatsAppWebhook = typeof ingestWhatsAppWebhook
type ArchiveWhatsAppWebhookMedia = typeof archiveWhatsAppWebhookMedia
type ArchiveWhatsAppWebhook = (input: {
  arrivedAt: Date
  channelId: number
  payload: unknown
  processedAt: Date
  processingStartedAt: Date
}) => Promise<void>

const archiveWhatsAppWebhook: ArchiveWhatsAppWebhook = async (input) => {
  await db.insert(webhooks).values({
    ...input,
    processingTimeMs: Math.max(
      0,
      input.processedAt.getTime() - input.processingStartedAt.getTime(),
    ),
    totalTimeMs: Math.max(
      0,
      input.processedAt.getTime() - input.arrivedAt.getTime(),
    ),
  })
}

export interface WhatsAppWebhookDeadLetter {
  schemaVersion: 1
  failedAt: string
  retryCount: number
  attempts: number
  error: {
    name: string
    message: string
  }
  originalEvent: EventMessage
}

export function createWhatsAppWebhookHandler(
  ingest: IngestWhatsAppWebhook = ingestWhatsAppWebhook,
  archiveMedia: ArchiveWhatsAppWebhookMedia = archiveWhatsAppWebhookMedia,
  realtime: Pick<PubSub, 'publish'> = pubsub,
  archive?: ArchiveWhatsAppWebhook,
): EventHandler {
  const archiveWebhook =
    archive ??
    (ingest === ingestWhatsAppWebhook &&
    archiveMedia === archiveWhatsAppWebhookMedia &&
    realtime === pubsub &&
    isWebhookArchiveEnabled()
      ? archiveWhatsAppWebhook
      : async () => undefined)
  return async (event) => {
    const processingStartedAt = new Date()
    const headerChannelId = event.headers['channel-id']
    if (event.key && headerChannelId && event.key !== headerChannelId) {
      throw new Error('WhatsApp webhook event key and channel header disagree')
    }

    const rawChannelId = headerChannelId ?? event.key
    if (!rawChannelId || !/^[1-9]\d*$/.test(rawChannelId)) {
      throw new Error('WhatsApp webhook event has an invalid channel ID')
    }

    const channelId = Number(rawChannelId)
    if (!Number.isSafeInteger(channelId)) {
      throw new Error('WhatsApp webhook channel ID exceeds integer precision')
    }

    let json: unknown
    try {
      json = JSON.parse(event.value)
    } catch {
      throw new Error('WhatsApp webhook event contains invalid JSON')
    }

    const payload = whatsappWebhookSchema.parse(json)
    const mediaFilePaths = await archiveMedia(channelId, payload)
    const summary = await ingest(channelId, payload, undefined, {
      mediaFilePaths,
    })

    await Promise.all(
      summary.updates.map((update) =>
        publishChatRealtimeEventSafely(
          realtime,
          summary.organizationId,
          update.chatId,
          update.type,
        ),
      ),
    )

    const headerArrivedAt = event.headers['arrived-at']
    const arrivedAt = headerArrivedAt
      ? new Date(headerArrivedAt)
      : new Date(event.timestamp)
    await archiveWebhook({
      arrivedAt: Number.isNaN(arrivedAt.getTime())
        ? new Date(event.timestamp)
        : arrivedAt,
      channelId,
      payload,
      processedAt: new Date(),
      processingStartedAt,
    })

    console.log(
      'Persisted WhatsApp webhook',
      JSON.stringify({ channelId, ...summary }),
    )
  }
}

const persistWhatsAppWebhook = createWhatsAppWebhookHandler()

interface WebhookRetryOptions {
  maxRetries: number
  now?: () => Date
}

export function createWhatsAppWebhookRetryHandler(
  handler: EventHandler,
  publisher: Pick<EventBus, 'publish'>,
  { maxRetries, now = () => new Date() }: WebhookRetryOptions,
): EventHandler {
  return async (event) => {
    try {
      await handler(event)
      return
    } catch (error) {
      const retryCount = retryCountFrom(event)
      const originalTopic = event.headers[ORIGINAL_TOPIC_HEADER] ?? event.topic
      const failedAt = now().toISOString()

      if (retryCount < maxRetries) {
        const nextRetryCount = retryCount + 1
        await publisher.publish(WA_CLOUD_WEBHOOK_TOPIC, event.value, {
          ...(event.key === null ? {} : { key: event.key }),
          headers: {
            ...event.headers,
            [RETRY_COUNT_HEADER]: String(nextRetryCount),
            [ORIGINAL_TOPIC_HEADER]: originalTopic,
            [FIRST_FAILED_AT_HEADER]:
              event.headers[FIRST_FAILED_AT_HEADER] ?? failedAt,
          },
        })
        console.warn(
          'Retrying WhatsApp webhook',
          JSON.stringify({
            channelId: event.headers['channel-id'] ?? event.key,
            maxRetries,
            retryCount: nextRetryCount,
          }),
        )
        return
      }

      const deadLetter: WhatsAppWebhookDeadLetter = {
        schemaVersion: 1,
        failedAt,
        retryCount,
        attempts: retryCount + 1,
        error: errorDetails(error),
        originalEvent: {
          ...event,
          topic: originalTopic,
        },
      }
      await publisher.publish(
        WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC,
        JSON.stringify(deadLetter),
        {
          ...(event.key === null ? {} : { key: event.key }),
          headers: {
            ...event.headers,
            [RETRY_COUNT_HEADER]: String(retryCount),
            [ORIGINAL_TOPIC_HEADER]: originalTopic,
          },
        },
      )
      console.error(
        'Dead-lettered WhatsApp webhook',
        JSON.stringify({
          channelId: event.headers['channel-id'] ?? event.key,
          errorName: deadLetter.error.name,
          retryCount,
        }),
      )
    }
  }
}

function retryCountFrom(event: EventMessage): number {
  const value = event.headers[RETRY_COUNT_HEADER]
  if (!value || !/^\d+$/.test(value)) return 0
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : 0
}

function errorDetails(error: unknown): WhatsAppWebhookDeadLetter['error'] {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  return { name: 'UnknownError', message: String(error) }
}

function logWhatsAppDeadLetter(event: EventMessage): void {
  let deadLetter: Partial<WhatsAppWebhookDeadLetter> | undefined
  try {
    deadLetter = JSON.parse(event.value) as Partial<WhatsAppWebhookDeadLetter>
  } catch {
    // The dead-letter handler never throws and therefore cannot poison itself.
  }

  console.error(
    'Observed WhatsApp webhook dead letter',
    JSON.stringify({
      channelId: event.headers['channel-id'] ?? event.key,
      errorName: deadLetter?.error?.name ?? 'UnknownError',
      retryCount: deadLetter?.retryCount ?? retryCountFrom(event),
    }),
  )
}

const webhookForwardRequestSchema = z.object({
  body: z.string(),
  channelId: z.number().int().positive(),
  contentType: z.string().min(1).max(500),
  signature: z.string().regex(/^sha256=[a-f\d]{64}$/i),
  url: z.string().url().refine(isHttpUrl),
})

export function createWhatsAppWebhookForwardHandler(
  request: typeof fetch = fetch,
): EventHandler {
  return async (event) => {
    let json: unknown
    try {
      json = JSON.parse(event.value)
    } catch {
      throw new Error('WhatsApp webhook forward event contains invalid JSON')
    }

    const forward = webhookForwardRequestSchema.parse(json)
    const headerChannelId = event.headers['channel-id']
    const eventChannelId = headerChannelId ?? event.key

    if (event.key && headerChannelId && event.key !== headerChannelId) {
      throw new Error(
        'WhatsApp webhook forward event key and channel header disagree',
      )
    }
    if (eventChannelId !== String(forward.channelId)) {
      throw new Error(
        'WhatsApp webhook forward event channel metadata disagrees with its payload',
      )
    }

    const response = await request(forward.url, {
      method: 'POST',
      headers: {
        'content-type': forward.contentType,
        'x-hub-signature-256': forward.signature,
      },
      body: forward.body,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(
        `Webhook forward request failed with status ${response.status}`,
      )
    }

    console.log(
      'Forwarded WhatsApp webhook',
      JSON.stringify({ channelId: forward.channelId, url: forward.url }),
    )
  }
}

const forwardWhatsAppWebhook = createWhatsAppWebhookForwardHandler()

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export const subscriberRegistry: SubscriberRegistry = {
  [WA_CLOUD_WEBHOOK_TOPIC]: [persistWhatsAppWebhook],
  [WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC]: [logWhatsAppDeadLetter],
  [WA_CLOUD_WEBHOOK_FORWARD_TOPIC]: [forwardWhatsAppWebhook],
}

interface RegisterSubscribersOptions {
  maxWebhookRetries?: number
  registry?: SubscriberRegistry
  topics?: readonly string[]
}

export function includeWhatsAppReliabilityTopics(
  topics: readonly string[],
): string[] {
  const expanded = new Set(topics)
  if (expanded.has(WA_CLOUD_WEBHOOK_TOPIC)) {
    expanded.add(WA_CLOUD_WEBHOOK_DEAD_LETTER_TOPIC)
  }
  return [...expanded]
}

export function registerSubscribers(
  eventBus: EventBus,
  options: RegisterSubscribersOptions = {},
): Unsubscribe {
  const defaultRegistry = options.registry === undefined
  const registry: SubscriberRegistry =
    options.registry ??
    (() => {
      const maxRetries =
        options.maxWebhookRetries ?? getWhatsAppWebhookMaxRetries()
      const retryingWebhookHandler = createWhatsAppWebhookRetryHandler(
        persistWhatsAppWebhook,
        eventBus,
        { maxRetries },
      )
      return {
        ...subscriberRegistry,
        [WA_CLOUD_WEBHOOK_TOPIC]: [retryingWebhookHandler],
      }
    })()
  const requestedTopics =
    options.topics ?? getSubscribedTopics(Object.keys(registry))
  const topics = defaultRegistry
    ? includeWhatsAppReliabilityTopics(requestedTopics)
    : requestedTopics
  const unsubscribers = topics.flatMap((topic) => {
    const handlers = registry[topic]

    if (!handlers) {
      throw new Error(
        `No subscriber handlers are registered for topic: ${topic}`,
      )
    }

    return handlers.map((handler) => eventBus.subscribe(topic, handler))
  })

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
