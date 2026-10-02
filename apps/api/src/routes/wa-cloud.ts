import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  assertWhatsAppWebhookMatchesChannel,
  findWhatsAppChannelById,
  type WhatsAppChannelConfiguration,
  WhatsAppWebhookChannelMismatchError,
} from '@mba-demo/db'
import type { EventBus } from '@mba-demo/events'
import { whatsappWebhookSchema } from '@mba-demo/wa-webhooks'
import { Hono } from 'hono'

export const WA_CLOUD_WEBHOOK_TOPIC = 'wa-cloud.webhook.v1'
export const WA_CLOUD_WEBHOOK_FORWARD_TOPIC = 'wa-cloud.webhook-forward.v1'
export const MAX_WA_CLOUD_WEBHOOK_BYTES = 1024 * 1024

export interface WhatsAppWebhookForwardRequest {
  body: string
  channelId: number
  contentType: string
  signature: string
  url: string
}

type FindWhatsAppChannel = (
  channelId: number,
) => Promise<WhatsAppChannelConfiguration | undefined>

export interface WaCloudWebhookRouteOptions {
  findChannel?: FindWhatsAppChannel
}

export const createWaCloudWebhookRoute = (
  eventBus: EventBus,
  { findChannel = findWhatsAppChannelById }: WaCloudWebhookRouteOptions = {},
) => {
  const route = new Hono()

  route.get('/:id', async (c) => {
    const channelId = parseChannelId(c.req.param('id'))
    if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

    const channel = await findChannel(channelId)
    if (!channel) return c.json({ message: 'Channel not found' }, 404)

    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')

    if (
      mode !== 'subscribe' ||
      !token ||
      !challenge ||
      !constantTimeEqual(token, channel.waWebhookVerifyToken)
    ) {
      return c.json({ message: 'Webhook verification failed' }, 403)
    }

    return c.text(challenge)
  })

  route.post('/:id', async (c) => {
    const channelId = parseChannelId(c.req.param('id'))
    if (!channelId) return c.json({ message: 'Invalid channel ID' }, 400)

    const contentType = c.req.header('content-type')?.toLowerCase() ?? ''
    if (!contentType.startsWith('application/json')) {
      return c.json({ message: 'Content-Type must be application/json' }, 415)
    }

    const contentLength = Number(c.req.header('content-length'))
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_WA_CLOUD_WEBHOOK_BYTES
    ) {
      return c.json({ message: 'Webhook payload is too large' }, 413)
    }

    const channel = await findChannel(channelId)
    if (!channel) return c.json({ message: 'Channel not found' }, 404)

    const body = Buffer.from(await c.req.arrayBuffer())
    if (body.byteLength > MAX_WA_CLOUD_WEBHOOK_BYTES) {
      return c.json({ message: 'Webhook payload is too large' }, 413)
    }

    const signature = c.req.header('x-hub-signature-256')
    if (!verifyWhatsAppSignature(body, signature, channel.waAppSecret)) {
      return c.json({ message: 'Invalid webhook signature' }, 401)
    }

    const payload = body.toString('utf8')
    let json: unknown
    try {
      json = JSON.parse(payload)
    } catch {
      return c.json({ message: 'Webhook body must be valid JSON' }, 400)
    }

    const parsed = whatsappWebhookSchema.safeParse(json)
    if (!parsed.success) {
      return c.json(
        {
          message: 'Invalid WhatsApp webhook payload',
          issues: parsed.error.issues,
        },
        400,
      )
    }

    try {
      assertWhatsAppWebhookMatchesChannel(parsed.data, channel)
    } catch (error) {
      if (error instanceof WhatsAppWebhookChannelMismatchError) {
        return c.json({ message: error.message }, 400)
      }
      throw error
    }

    const eventOptions = {
      key: String(channelId),
      headers: {
        'arrived-at': new Date().toISOString(),
        'channel-id': String(channelId),
        'content-type': 'application/json',
        source: 'wa-cloud-webhook',
      },
    } as const

    await Promise.all([
      eventBus.publish(WA_CLOUD_WEBHOOK_TOPIC, payload, eventOptions),
      ...channel.webhookForwardUrls.map((url) => {
        const forwardRequest: WhatsAppWebhookForwardRequest = {
          body: payload,
          channelId,
          contentType,
          signature: signature!,
          url,
        }

        return eventBus.publish(
          WA_CLOUD_WEBHOOK_FORWARD_TOPIC,
          JSON.stringify(forwardRequest),
          eventOptions,
        )
      }),
    ])

    return c.json(
      {
        accepted: true as const,
        channelId,
        mode: eventBus.mode,
        topic: WA_CLOUD_WEBHOOK_TOPIC,
      },
      202,
    )
  })

  return route
}

export function verifyWhatsAppSignature(
  body: Uint8Array,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature?.startsWith('sha256=')) return false
  const receivedHex = signature.slice('sha256='.length)
  if (!/^[a-f\d]{64}$/i.test(receivedHex)) return false

  const expected = createHmac('sha256', appSecret).update(body).digest()
  const received = Buffer.from(receivedHex, 'hex')
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

function parseChannelId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined
  const channelId = Number(value)
  return Number.isSafeInteger(channelId) ? channelId : undefined
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  )
}
