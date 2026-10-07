import { z } from 'zod'
import {
  contactNameSchema,
  locationContentSchema,
  sharedContactSchema,
} from '@mba-desk/wa-webhooks'

export const outboundMessageContextSchema = z.looseObject({
  message_id: z.string(),
})

const outboundMessageBaseSchema = z.looseObject({
  messaging_product: z.literal('whatsapp'),
  recipient_type: z.enum(['individual', 'group']).optional(),
  to: z.string(),
  context: outboundMessageContextSchema.optional(),
})

export const outboundMediaReferenceSchema = z.union([
  z.looseObject({
    id: z.string(),
    link: z.never().optional(),
  }),
  z.looseObject({
    id: z.never().optional(),
    link: z.string(),
  }),
])

export const outboundAudioSchema = outboundMediaReferenceSchema.and(
  z.looseObject({ voice: z.boolean().optional() }),
)

export const outboundImageSchema = outboundMediaReferenceSchema.and(
  z.looseObject({ caption: z.string().optional() }),
)

export const outboundVideoSchema = outboundMediaReferenceSchema.and(
  z.looseObject({ caption: z.string().optional() }),
)

export const outboundDocumentSchema = outboundMediaReferenceSchema.and(
  z.looseObject({
    caption: z.string().optional(),
    filename: z.string().optional(),
  }),
)

export const outboundStickerSchema = outboundMediaReferenceSchema

export const outboundTextSchema = z.looseObject({
  body: z.string(),
  preview_url: z.boolean().optional(),
})

export const outboundReactionSchema = z.looseObject({
  message_id: z.string(),
  emoji: z.string(),
})

const outboundContactNameSchema = contactNameSchema.refine(
  ({ first_name, last_name, middle_name, prefix, suffix }) =>
    [first_name, last_name, middle_name, prefix, suffix].some(
      (value) => value !== undefined && value.trim().length > 0,
    ),
  {
    message: 'Contact name must include at least one structured name parameter',
  },
)

export const outboundContactSchema = sharedContactSchema.extend({
  name: outboundContactNameSchema,
})

const interactiveTextSchema = z.looseObject({ text: z.string() })

export const outboundInteractiveHeaderSchema = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('text'), text: z.string() }),
  z.looseObject({ type: z.literal('image'), image: outboundImageSchema }),
  z.looseObject({ type: z.literal('video'), video: outboundVideoSchema }),
  z.looseObject({
    type: z.literal('document'),
    document: outboundDocumentSchema,
  }),
])

const listRowSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
})

const listSectionSchema = z.looseObject({
  title: z.string().optional(),
  rows: z.array(listRowSchema),
})

const productSectionSchema = z.looseObject({
  title: z.string().optional(),
  product_items: z.array(z.looseObject({ product_retailer_id: z.string() })),
})

const replyButtonSchema = z.looseObject({
  type: z.literal('reply'),
  reply: z.looseObject({
    id: z.string(),
    title: z.string(),
  }),
})

const flowActionParametersSchema = z.looseObject({
  flow_message_version: z.string(),
  flow_action: z.enum(['data_exchange', 'navigate']),
  flow_token: z.string(),
  flow_id: z.string().optional(),
  flow_name: z.string().optional(),
  flow_cta: z.string(),
  mode: z.enum(['draft', 'published']).optional(),
  flow_action_payload: z
    .looseObject({
      screen: z.string(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
})

export const outboundInteractiveSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('list'),
    header: outboundInteractiveHeaderSchema.optional(),
    body: interactiveTextSchema,
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({
      button: z.string(),
      sections: z.array(listSectionSchema),
    }),
  }),
  z.looseObject({
    type: z.literal('button'),
    header: outboundInteractiveHeaderSchema.optional(),
    body: interactiveTextSchema,
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({ buttons: z.array(replyButtonSchema) }),
  }),
  z.looseObject({
    type: z.literal('product'),
    body: interactiveTextSchema.optional(),
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({
      catalog_id: z.string(),
      product_retailer_id: z.string(),
    }),
  }),
  z.looseObject({
    type: z.literal('product_list'),
    header: outboundInteractiveHeaderSchema,
    body: interactiveTextSchema,
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({
      catalog_id: z.string(),
      sections: z.array(productSectionSchema),
    }),
  }),
  z.looseObject({
    type: z.literal('catalog_message'),
    body: interactiveTextSchema,
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({
      name: z.literal('catalog_message'),
      parameters: z.looseObject({
        thumbnail_product_retailer_id: z.string().optional(),
      }),
    }),
  }),
  z.looseObject({
    type: z.literal('flow'),
    header: outboundInteractiveHeaderSchema.optional(),
    body: interactiveTextSchema,
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({
      name: z.literal('flow'),
      parameters: flowActionParametersSchema,
    }),
  }),
  z.looseObject({
    type: z.literal('cta_url'),
    header: outboundInteractiveHeaderSchema.optional(),
    body: interactiveTextSchema,
    footer: interactiveTextSchema.optional(),
    action: z.looseObject({
      name: z.literal('cta_url'),
      parameters: z.looseObject({
        display_text: z.string(),
        url: z.string(),
      }),
    }),
  }),
  z.looseObject({
    type: z.literal('location_request_message'),
    body: interactiveTextSchema,
    action: z.looseObject({ name: z.literal('send_location') }),
  }),
])

const currencyParameterSchema = z.looseObject({
  fallback_value: z.string(),
  code: z.string(),
  amount_1000: z.number(),
})

const dateTimeParameterSchema = z.looseObject({
  fallback_value: z.string(),
  day_of_week: z.union([z.number(), z.string()]).optional(),
  year: z.number().optional(),
  month: z.number().optional(),
  day_of_month: z.number().optional(),
  hour: z.number().optional(),
  minute: z.number().optional(),
  calendar: z.enum(['GREGORIAN', 'SOLAR_HIJRI']).optional(),
})

const templateActionSchema = z.looseObject({
  flow_token: z.string().optional(),
  flow_action_data: z.record(z.string(), z.unknown()).optional(),
  thumbnail_product_retailer_id: z.string().optional(),
})

export const templateParameterSchema = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('text'), text: z.string() }),
  z.looseObject({
    type: z.literal('currency'),
    currency: currencyParameterSchema,
  }),
  z.looseObject({
    type: z.literal('date_time'),
    date_time: dateTimeParameterSchema,
  }),
  z.looseObject({ type: z.literal('image'), image: outboundImageSchema }),
  z.looseObject({
    type: z.literal('document'),
    document: outboundDocumentSchema,
  }),
  z.looseObject({ type: z.literal('video'), video: outboundVideoSchema }),
  z.looseObject({ type: z.literal('payload'), payload: z.string() }),
  z.looseObject({ type: z.literal('coupon_code'), coupon_code: z.string() }),
  z.looseObject({ type: z.literal('action'), action: templateActionSchema }),
])

export const templateComponentSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('header'),
    parameters: z.array(templateParameterSchema),
  }),
  z.looseObject({
    type: z.literal('body'),
    parameters: z.array(templateParameterSchema),
  }),
  z.looseObject({
    type: z.literal('button'),
    sub_type: z.enum([
      'CATALOG',
      'catalog',
      'copy_code',
      'flow',
      'quick_reply',
      'url',
    ]),
    index: z.union([z.number(), z.string()]),
    parameters: z.array(templateParameterSchema),
  }),
])

export const outboundTemplateSchema = z.looseObject({
  name: z.string(),
  language: z.looseObject({
    code: z.string(),
    policy: z.literal('deterministic').optional(),
  }),
  components: z.array(templateComponentSchema).optional(),
})

export const whatsappOutboundMessageSchema = z.discriminatedUnion('type', [
  outboundMessageBaseSchema.extend({
    type: z.literal('audio'),
    audio: outboundAudioSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('contacts'),
    contacts: z.array(outboundContactSchema),
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('document'),
    document: outboundDocumentSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('image'),
    image: outboundImageSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('interactive'),
    interactive: outboundInteractiveSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('location'),
    location: locationContentSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('reaction'),
    reaction: outboundReactionSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('sticker'),
    sticker: outboundStickerSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('template'),
    template: outboundTemplateSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('text'),
    text: outboundTextSchema,
  }),
  outboundMessageBaseSchema.extend({
    type: z.literal('video'),
    video: outboundVideoSchema,
  }),
])

export const whatsappSendMessageResponseSchema = z.looseObject({
  messaging_product: z.literal('whatsapp'),
  contacts: z.array(
    z.looseObject({
      input: z.string(),
      wa_id: z.string(),
    }),
  ),
  messages: z.array(z.looseObject({ id: z.string() })),
})

export const whatsappMessageActionResponseSchema = z.looseObject({
  success: z.literal(true),
})

export type WhatsAppOutboundMessage = z.infer<
  typeof whatsappOutboundMessageSchema
>
export type WhatsAppSendMessageResponse = z.infer<
  typeof whatsappSendMessageResponseSchema
>
export type WhatsAppMessageActionResponse = z.infer<
  typeof whatsappMessageActionResponseSchema
>
