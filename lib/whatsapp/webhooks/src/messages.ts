import { z } from 'zod'
import {
  identitySchema,
  messageContextSchema,
  referralSchema,
  webhookErrorSchema,
} from './common.js'

export const textContentSchema = z.looseObject({
  body: z.string(),
})

export const mediaContentSchema = z.looseObject({
  id: z.string(),
  mime_type: z.string(),
  sha256: z.string(),
  url: z.string().optional(),
})

export const audioContentSchema = mediaContentSchema.extend({
  voice: z.boolean().optional(),
})

export const imageContentSchema = mediaContentSchema.extend({
  caption: z.string().optional(),
})

export const videoContentSchema = mediaContentSchema.extend({
  caption: z.string().optional(),
})

export const documentContentSchema = mediaContentSchema.extend({
  caption: z.string().optional(),
  filename: z.string().optional(),
})

export const stickerContentSchema = mediaContentSchema.extend({
  animated: z.boolean().optional(),
})

export const buttonContentSchema = z.looseObject({
  payload: z.string(),
  text: z.string(),
})

export const contactAddressSchema = z.looseObject({
  city: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  state: z.string().optional(),
  street: z.string().optional(),
  type: z.string().optional(),
  zip: z.string().optional(),
})

export const contactEmailSchema = z.looseObject({
  email: z.string().optional(),
  type: z.string().optional(),
})

export const contactNameSchema = z.looseObject({
  formatted_name: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  middle_name: z.string().optional(),
  suffix: z.string().optional(),
  prefix: z.string().optional(),
})

export const contactOrganizationSchema = z.looseObject({
  company: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
})

export const contactPhoneSchema = z.looseObject({
  phone: z.string().optional(),
  wa_id: z.string().optional(),
  type: z.string().optional(),
})

export const contactUrlSchema = z.looseObject({
  url: z.string().optional(),
  type: z.string().optional(),
})

export const sharedContactSchema = z.looseObject({
  addresses: z.array(contactAddressSchema).optional(),
  birthday: z.string().optional(),
  emails: z.array(contactEmailSchema).optional(),
  name: contactNameSchema,
  org: contactOrganizationSchema.optional(),
  phones: z.array(contactPhoneSchema).optional(),
  urls: z.array(contactUrlSchema).optional(),
})

export const buttonReplySchema = z.looseObject({
  id: z.string(),
  title: z.string(),
})

export const listReplySchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
})

export const flowReplySchema = z.looseObject({
  response_json: z.string(),
  body: z.string().optional(),
  name: z.string().optional(),
})

export const callPermissionReplySchema = z.looseObject({
  response: z.enum(['accept', 'reject']),
  is_permanent: z.boolean().optional(),
  expiration_timestamp: z.string().optional(),
  response_source: z.enum(['user_action', 'automatic']),
})

export const interactiveContentSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('button_reply'),
    button_reply: buttonReplySchema,
  }),
  z.looseObject({
    type: z.literal('list_reply'),
    list_reply: listReplySchema,
  }),
  z.looseObject({
    type: z.literal('nfm_reply'),
    nfm_reply: flowReplySchema,
  }),
  z.looseObject({
    type: z.literal('call_permission_reply'),
    call_permission_reply: callPermissionReplySchema,
  }),
])

export const locationContentSchema = z.looseObject({
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional(),
})

export const orderProductItemSchema = z.looseObject({
  product_retailer_id: z.string(),
  quantity: z.union([z.number(), z.string()]),
  item_price: z.union([z.number(), z.string()]),
  currency: z.string(),
})

export const orderContentSchema = z.looseObject({
  catalog_id: z.string(),
  text: z.string().optional(),
  product_items: z.array(orderProductItemSchema),
})

export const reactionContentSchema = z.union([
  z.looseObject({
    message_id: z.string(),
    emoji: z.string().optional(),
  }),
  // Historical collection revisions contained this misspelling on the wire.
  z.looseObject({
    messsage_id: z.string(),
    emoji: z.string().optional(),
  }),
])

export const systemContentSchema = z.looseObject({
  body: z.string(),
  wa_id: z.string(),
  type: z.enum(['user_changed_number', 'user_identity_changed']),
  identity: z.string().optional(),
  customer: z.string().optional(),
})

export const unsupportedContentSchema = z.looseObject({
  type: z.string(),
})

export const editedMessageContentSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('text'),
    context: z.looseObject({ id: z.string() }).optional(),
    text: textContentSchema,
  }),
  z.looseObject({
    type: z.literal('image'),
    context: z.looseObject({ id: z.string() }).optional(),
    image: imageContentSchema,
  }),
  z.looseObject({
    type: z.literal('video'),
    context: z.looseObject({ id: z.string() }).optional(),
    video: videoContentSchema,
  }),
  z.looseObject({
    type: z.literal('document'),
    context: z.looseObject({ id: z.string() }).optional(),
    document: documentContentSchema,
  }),
])

export const editContentSchema = z.looseObject({
  original_message_id: z.string(),
  message: editedMessageContentSchema,
})

export const revokeContentSchema = z.looseObject({
  original_message_id: z.string(),
})

export const messageBaseSchema = z.looseObject({
  from: z.string().optional(),
  from_user_id: z.string().optional(),
  from_parent_user_id: z.string().optional(),
  group_id: z.string().optional(),
  id: z.string(),
  timestamp: z.string(),
  context: messageContextSchema.optional(),
  referral: referralSchema.optional(),
  identity: identitySchema.optional(),
})

export const audioMessageSchema = messageBaseSchema.extend({
  type: z.literal('audio'),
  audio: audioContentSchema,
})

export const buttonMessageSchema = messageBaseSchema.extend({
  type: z.literal('button'),
  button: buttonContentSchema,
})

export const contactsMessageSchema = messageBaseSchema.extend({
  type: z.literal('contacts'),
  contacts: z.array(sharedContactSchema),
})

export const documentMessageSchema = messageBaseSchema.extend({
  type: z.literal('document'),
  document: documentContentSchema,
})

export const editMessageSchema = messageBaseSchema.extend({
  type: z.literal('edit'),
  edit: editContentSchema,
})

export const imageMessageSchema = messageBaseSchema.extend({
  type: z.literal('image'),
  image: imageContentSchema,
})

export const interactiveMessageSchema = messageBaseSchema.extend({
  type: z.literal('interactive'),
  interactive: interactiveContentSchema,
})

export const locationMessageSchema = messageBaseSchema.extend({
  type: z.literal('location'),
  location: locationContentSchema,
})

export const orderMessageSchema = messageBaseSchema.extend({
  type: z.literal('order'),
  order: orderContentSchema,
})

export const reactionMessageSchema = messageBaseSchema.extend({
  type: z.literal('reaction'),
  reaction: reactionContentSchema,
})

export const revokeMessageSchema = messageBaseSchema.extend({
  type: z.literal('revoke'),
  revoke: revokeContentSchema,
})

export const stickerMessageSchema = messageBaseSchema.extend({
  type: z.literal('sticker'),
  sticker: stickerContentSchema,
})

export const systemMessageSchema = messageBaseSchema.extend({
  type: z.literal('system'),
  system: systemContentSchema,
})

export const textMessageSchema = messageBaseSchema.extend({
  type: z.literal('text'),
  text: textContentSchema,
})

export const unsupportedMessageSchema = messageBaseSchema.extend({
  type: z.literal('unsupported'),
  errors: z.array(webhookErrorSchema),
  unsupported: unsupportedContentSchema,
})

// Kept for payloads produced by older Graph API versions and present in the
// checked-in WhatsApp Cloud API collection.
export const unknownMessageSchema = messageBaseSchema.extend({
  type: z.literal('unknown'),
  errors: z.array(webhookErrorSchema),
})

export const videoMessageSchema = messageBaseSchema.extend({
  type: z.literal('video'),
  video: videoContentSchema,
})

export const whatsappMessageSchema = z.discriminatedUnion('type', [
  audioMessageSchema,
  buttonMessageSchema,
  contactsMessageSchema,
  documentMessageSchema,
  editMessageSchema,
  imageMessageSchema,
  interactiveMessageSchema,
  locationMessageSchema,
  orderMessageSchema,
  reactionMessageSchema,
  revokeMessageSchema,
  stickerMessageSchema,
  systemMessageSchema,
  textMessageSchema,
  unsupportedMessageSchema,
  unknownMessageSchema,
  videoMessageSchema,
])

export type WhatsAppMessage = z.infer<typeof whatsappMessageSchema>
