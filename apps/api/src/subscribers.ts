import { ingestWhatsAppWebhook } from '@mba-demo/db'
import type { EventBus, EventHandler, Unsubscribe } from '@mba-demo/events'
import { whatsappWebhookSchema } from '@mba-demo/schemas/wa-cloud/webhooks'
import { DEMO_EVENT_TOPIC } from './routes/events.js'
import { WA_CLOUD_WEBHOOK_TOPIC } from './routes/wa-cloud.js'
import { getSubscribedTopics } from './worker-config.js'

export type SubscriberRegistry = Readonly<
  Record<string, readonly EventHandler[]>
>

const logDemoEvent: EventHandler = (event) => {
  console.log(
    'Received event',
    JSON.stringify({
      topic: event.topic,
      key: event.key,
      value: event.value,
      timestamp: event.timestamp,
    }),
  )
}

type IngestWhatsAppWebhook = typeof ingestWhatsAppWebhook

export function createWhatsAppWebhookHandler(
  ingest: IngestWhatsAppWebhook = ingestWhatsAppWebhook,
): EventHandler {
  return async (event) => {
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
    const summary = await ingest(channelId, payload)

    console.log(
      'Persisted WhatsApp webhook',
      JSON.stringify({ channelId, ...summary }),
    )
  }
}

const persistWhatsAppWebhook = createWhatsAppWebhookHandler()

export const subscriberRegistry: SubscriberRegistry = {
  [DEMO_EVENT_TOPIC]: [logDemoEvent],
  [WA_CLOUD_WEBHOOK_TOPIC]: [persistWhatsAppWebhook],
}

interface RegisterSubscribersOptions {
  registry?: SubscriberRegistry
  topics?: readonly string[]
}

export function registerSubscribers(
  eventBus: EventBus,
  options: RegisterSubscribersOptions = {},
): Unsubscribe {
  const registry = options.registry ?? subscriberRegistry
  const topics = options.topics ?? getSubscribedTopics(Object.keys(registry))
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
