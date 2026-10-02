import type { Template } from '@mba-demo/wa-messaging'

export type MarketingMessageProductPolicy = 'CLOUD_API_FALLBACK' | 'STRICT'

export interface MarketingMessageBidSpec {
  /** Positive multiplier applied to the template-level maximum price. */
  per_message_bid_multiplier: number
}

export interface SendMarketingMessageInput {
  to: string
  template: Template
  product_policy?: MarketingMessageProductPolicy
  message_activity_sharing?: boolean
  bid_spec?: MarketingMessageBidSpec
}

export interface MarketingMessageRequest extends SendMarketingMessageInput {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  type: 'template'
}

export interface MarketingMessageContact {
  input: string
  wa_id: string
}

export type MarketingMessageStatus =
  'accepted' | 'held_for_quality_assessment' | 'paused'

export interface MarketingMessageResult {
  id: string
  message_status?: MarketingMessageStatus
  [key: string]: unknown
}

export interface SendMarketingMessageResponse {
  messaging_product: 'whatsapp'
  contacts: MarketingMessageContact[]
  messages: MarketingMessageResult[]
  [key: string]: unknown
}

export interface MarketingMessageRequestOptions {
  signal?: AbortSignal
}

export type { Template } from '@mba-demo/wa-messaging'
