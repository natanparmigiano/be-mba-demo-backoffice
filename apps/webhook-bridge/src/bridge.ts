import { setTimeout as delay } from 'node:timers/promises'
import type { EventBus } from '@mba-demo/events'
import { whatsappWebhookSchema } from '@mba-demo/wa-webhooks'

export const WA_CLOUD_WEBHOOK_TOPIC = 'wa-cloud.webhook.v1'
export const POLL_INTERVAL_MS = 1_000
export const MAX_WEBHOOK_BYTES = 1024 * 1024

export interface WebhookDelivery {
  id: string
  payloadValid: boolean
  rawPayload: string
}

export type DeliveryOutcome = 'published'

export interface DeliveryBatchResult {
  published: number
  selected: number
}

export interface WebhookDeliveryQueue {
  consumeBatch(
    limit: number,
    consume: (delivery: WebhookDelivery) => Promise<DeliveryOutcome>,
  ): Promise<DeliveryBatchResult>
  close(): Promise<void>
}

export interface BridgeStats extends DeliveryBatchResult {
  batches: number
}

export interface RunWebhookBridgeOptions {
  batchSize: number
  channelId: number
  signal: AbortSignal
  onBatch?: (batch: DeliveryBatchResult, totals: BridgeStats) => void
  onInvalid?: (
    delivery: WebhookDelivery,
    reason: string,
  ) => void | Promise<void>
}

type WebhookPublisher = Pick<EventBus, 'publish'>

export async function publishDelivery(
  publisher: WebhookPublisher,
  delivery: WebhookDelivery,
  channelId: number,
  onInvalid: RunWebhookBridgeOptions['onInvalid'] = () => undefined,
): Promise<DeliveryOutcome> {
  const validationFailure = getValidationFailure(delivery)
  if (validationFailure) {
    await onInvalid(delivery, validationFailure)
  }

  const channel = String(channelId)
  await publisher.publish(WA_CLOUD_WEBHOOK_TOPIC, delivery.rawPayload, {
    key: channel,
    headers: {
      'channel-id': channel,
      'content-type': 'application/json',
      source: 'wa-cloud-webhook',
    },
  })
  return 'published'
}

function getValidationFailure(delivery: WebhookDelivery): string | undefined {
  if (!delivery.payloadValid) return 'source row is marked invalid'

  if (Buffer.byteLength(delivery.rawPayload, 'utf8') > MAX_WEBHOOK_BYTES) {
    return 'raw_payload exceeds the 1 MiB webhook limit'
  }

  let json: unknown
  try {
    json = JSON.parse(delivery.rawPayload)
  } catch {
    return 'raw_payload is not valid JSON'
  }

  const parsed = whatsappWebhookSchema.safeParse(json)
  if (parsed.success) return undefined

  const issues = parsed.error.issues
    .map(
      (issue) =>
        `[${issue.code}] ${formatIssuePath(issue.path)}: ${issue.message}`,
    )
    .join('; ')
  return `raw_payload is not a valid WhatsApp webhook: ${issues}`
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') return `${formatted}[${segment}]`

    const property = String(segment)
    return /^[A-Za-z_$][\w$]*$/.test(property)
      ? `${formatted}.${property}`
      : `${formatted}[${JSON.stringify(property)}]`
  }, '$')
}

export async function runWebhookBridge(
  queue: WebhookDeliveryQueue,
  publisher: WebhookPublisher,
  options: RunWebhookBridgeOptions,
): Promise<BridgeStats> {
  const totals: BridgeStats = {
    batches: 0,
    published: 0,
    selected: 0,
  }

  while (!options.signal.aborted) {
    const batch = await queue.consumeBatch(options.batchSize, (delivery) =>
      publishDelivery(
        publisher,
        delivery,
        options.channelId,
        options.onInvalid,
      ),
    )

    totals.batches += 1
    totals.published += batch.published
    totals.selected += batch.selected
    options.onBatch?.(batch, totals)

    if (options.signal.aborted) break
    try {
      await delay(POLL_INTERVAL_MS, undefined, { signal: options.signal })
    } catch (error) {
      if (options.signal.aborted) break
      throw error
    }
  }

  return totals
}
