import { createHmac } from 'node:crypto'
import type { GeneratedWebhook } from './types.js'

export interface WebhookSink {
  send(event: GeneratedWebhook, signal: AbortSignal): Promise<void>
}

export interface HttpWebhookSinkOptions {
  appSecret: string
  requestTimeoutMs: number
  target: string
}

export class HttpWebhookSink implements WebhookSink {
  constructor(private readonly options: HttpWebhookSinkOptions) {}

  async send(event: GeneratedWebhook, signal: AbortSignal): Promise<void> {
    const body = JSON.stringify(event.payload)
    const timeout = AbortSignal.timeout(this.options.requestTimeoutMs)
    const response = await fetch(this.options.target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhook(body, this.options.appSecret),
        'x-synthetic-webhook-kind': event.kind,
      },
      body,
      signal: AbortSignal.any([signal, timeout]),
    })

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000)
      throw new Error(
        `Webhook endpoint returned ${response.status}: ${responseBody}`,
      )
    }
  }
}

export class NdjsonWebhookSink implements WebhookSink {
  async send(event: GeneratedWebhook): Promise<void> {
    process.stdout.write(`${JSON.stringify(event.payload)}\n`)
  }
}

export function signWebhook(body: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
}
