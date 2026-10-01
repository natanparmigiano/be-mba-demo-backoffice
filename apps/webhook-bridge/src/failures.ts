import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { WebhookDelivery } from './bridge.js'

export const FAILURE_FILE_NAME = 'fails.jsonl'

interface AppendFailureOptions {
  channelId: number
  filePath?: string
  now?: () => Date
}

export async function appendFailureJsonl(
  delivery: WebhookDelivery,
  reason: string,
  {
    channelId,
    filePath = resolve(process.cwd(), FAILURE_FILE_NAME),
    now = () => new Date(),
  }: AppendFailureOptions,
): Promise<void> {
  const record = {
    capturedAt: now().toISOString(),
    channelId,
    deliveryId: delivery.id,
    payloadValid: delivery.payloadValid,
    reason,
    rawPayload: delivery.rawPayload,
  }

  await appendFile(filePath, `${JSON.stringify(record)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
}
