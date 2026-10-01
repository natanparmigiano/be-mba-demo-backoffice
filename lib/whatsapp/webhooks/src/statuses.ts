import { z } from 'zod'
import { webhookErrorSchema } from './common.js'

export const conversationOriginSchema = z.looseObject({
  type: z.enum([
    'authentication',
    'marketing',
    'service',
    'utility',
    'referral_conversion',
  ]),
})

export const conversationSchema = z.looseObject({
  id: z.string(),
  expiration_timestamp: z.string().optional(),
  origin: conversationOriginSchema,
})

export const pricingSchema = z.looseObject({
  billable: z.boolean(),
  pricing_model: z.string(),
  category: z.string().optional(),
  type: z.string().optional(),
})

export const messageStatusSchema = z.looseObject({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'played', 'failed', 'deleted']),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  recipient_user_id: z.string().optional(),
  recipient_parent_user_id: z.string().optional(),
  type: z.literal('message').optional(),
  recipient_type: z.literal('group').optional(),
  recipient_participant_id: z.string().optional(),
  recipient_identity_key_hash: z.string().optional(),
  biz_opaque_callback_data: z.string().optional(),
  conversation: conversationSchema.optional(),
  pricing: pricingSchema.optional(),
  errors: z.array(webhookErrorSchema).optional(),
})

export const paymentStatusSchema = z.looseObject({
  id: z.string(),
  from: z.string(),
  type: z.literal('payment'),
  status: z.enum(['captured', 'failed', 'pending']),
  payment: z.looseObject({
    reference_id: z.string(),
  }),
  timestamp: z.string(),
})

export const whatsappStatusSchema = z.union([
  paymentStatusSchema,
  messageStatusSchema,
])

export type WhatsAppMessageStatus = z.infer<typeof messageStatusSchema>
export type WhatsAppPaymentStatus = z.infer<typeof paymentStatusSchema>
export type WhatsAppStatus = z.infer<typeof whatsappStatusSchema>
