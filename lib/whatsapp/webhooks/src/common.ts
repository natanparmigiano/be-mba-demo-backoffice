import { z } from 'zod'

export const webhookTimestampSchema = z.union([z.string(), z.number()])

export const webhookErrorDataSchema = z.looseObject({
  details: z.string(),
})

export const webhookErrorSchema = z.looseObject({
  code: z.union([z.number(), z.string()]),
  title: z.string().optional(),
  message: z.string().optional(),
  error_data: webhookErrorDataSchema.optional(),
  href: z.string().optional(),
})

export const whatsappMetadataSchema = z.looseObject({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
})

export const whatsappProfileSchema = z.looseObject({
  name: z.string(),
  username: z.string().optional(),
})

export const whatsappContactSchema = z.looseObject({
  profile: whatsappProfileSchema.optional(),
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
  parent_user_id: z.string().optional(),
  identity_key_hash: z.string().optional(),
})

export const referredProductSchema = z.looseObject({
  catalog_id: z.string(),
  product_retailer_id: z.string(),
})

export const messageContextSchema = z.looseObject({
  from: z.string().optional(),
  id: z.string().optional(),
  forwarded: z.boolean().optional(),
  frequently_forwarded: z.boolean().optional(),
  referred_product: referredProductSchema.optional(),
})

export const referralSchema = z.looseObject({
  source_url: z.string(),
  source_type: z.string(),
  source_id: z.string(),
  headline: z.string().optional(),
  body: z.string().optional(),
  media_type: z.string().optional(),
  image_url: z.string().optional(),
  video_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  ctwa_clid: z.string().optional(),
  welcome_message: z
    .looseObject({
      text: z.string(),
    })
    .optional(),
})

export const identitySchema = z.looseObject({
  acknowledged: z.boolean(),
  created_timestamp: webhookTimestampSchema,
  hash: z.string(),
})

export const messagingValueBaseSchema = z.looseObject({
  messaging_product: z.literal('whatsapp'),
  metadata: whatsappMetadataSchema,
})

export type WebhookError = z.infer<typeof webhookErrorSchema>
export type WhatsAppMetadata = z.infer<typeof whatsappMetadataSchema>
export type WhatsAppContact = z.infer<typeof whatsappContactSchema>
export type MessageContext = z.infer<typeof messageContextSchema>
export type Referral = z.infer<typeof referralSchema>
