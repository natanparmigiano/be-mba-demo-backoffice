export interface MessageContext {
  message_id: string
}

interface MessageBase {
  to: string
  recipient_type?: 'individual' | 'group'
}

interface ContextualMessageBase extends MessageBase {
  context?: MessageContext
}

export type MediaSource =
  { id: string; link?: never } | { id?: never; link: string }

export type Audio = MediaSource & { voice?: boolean }
export type Image = MediaSource & { caption?: string }
export type Video = MediaSource & { caption?: string }
export type Document = MediaSource & {
  caption?: string
  filename?: string
}
export type Sticker = MediaSource

export interface TextContent {
  body: string
  preview_url?: boolean
}

export interface LocationContent {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface ContactAddress {
  street?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  country_code?: string
  type?: 'HOME' | 'WORK'
}

export interface ContactEmail {
  email?: string
  type?: 'HOME' | 'WORK'
}

export interface ContactName {
  formatted_name: string
  first_name?: string
  last_name?: string
  middle_name?: string
  suffix?: string
  prefix?: string
}

export interface ContactOrganization {
  company?: string
  department?: string
  title?: string
}

export interface ContactPhone {
  phone?: string
  wa_id?: string
  type?: 'CELL' | 'MAIN' | 'IPHONE' | 'HOME' | 'WORK'
}

export interface ContactUrl {
  url?: string
  type?: 'HOME' | 'WORK'
}

export interface Contact {
  name: ContactName
  addresses?: ContactAddress[]
  birthday?: string
  emails?: ContactEmail[]
  org?: ContactOrganization
  phones?: ContactPhone[]
  urls?: ContactUrl[]
}

export type InteractiveHeader =
  | { type: 'text'; text: string }
  | { type: 'image'; image: Image }
  | { type: 'video'; video: Video }
  | { type: 'document'; document: Document }

export interface InteractiveText {
  text: string
}

export interface ListRow {
  id: string
  title: string
  description?: string
}

export interface ListSection {
  title?: string
  rows: ListRow[]
}

export interface ProductSection {
  title?: string
  product_items: Array<{ product_retailer_id: string }>
}

export interface FlowActionParameters {
  flow_message_version: string
  flow_action: 'data_exchange' | 'navigate'
  flow_token: string
  flow_id?: string
  flow_name?: string
  flow_cta: string
  mode?: 'draft' | 'published'
  flow_action_payload?: {
    screen: string
    data?: Record<string, unknown>
  }
}

export type Interactive =
  | {
      type: 'list'
      header?: Extract<InteractiveHeader, { type: 'text' }>
      body: InteractiveText
      footer?: InteractiveText
      action: { button: string; sections: ListSection[] }
    }
  | {
      type: 'button'
      header?: InteractiveHeader
      body: InteractiveText
      footer?: InteractiveText
      action: {
        buttons: Array<{
          type: 'reply'
          reply: { id: string; title: string }
        }>
      }
    }
  | {
      type: 'product'
      body?: InteractiveText
      footer?: InteractiveText
      action: { catalog_id: string; product_retailer_id: string }
    }
  | {
      type: 'product_list'
      header: Extract<InteractiveHeader, { type: 'text' }>
      body: InteractiveText
      footer?: InteractiveText
      action: { catalog_id: string; sections: ProductSection[] }
    }
  | {
      type: 'catalog_message'
      body: InteractiveText
      footer?: InteractiveText
      action: {
        name: 'catalog_message'
        parameters: { thumbnail_product_retailer_id?: string }
      }
    }
  | {
      type: 'flow'
      header?: InteractiveHeader
      body: InteractiveText
      footer?: InteractiveText
      action: { name: 'flow'; parameters: FlowActionParameters }
    }
  | {
      type: 'cta_url'
      header?: InteractiveHeader
      body: InteractiveText
      footer?: InteractiveText
      action: {
        name: 'cta_url'
        parameters: { display_text: string; url: string }
      }
    }
  | {
      type: 'location_request_message'
      body: InteractiveText
      action: { name: 'send_location' }
    }

export interface TemplateCurrency {
  fallback_value: string
  code: string
  amount_1000: number
}

export interface TemplateDateTime {
  fallback_value: string
  day_of_week?: number | string
  year?: number
  month?: number
  day_of_month?: number
  hour?: number
  minute?: number
  calendar?: 'GREGORIAN' | 'SOLAR_HIJRI'
}

interface NamedTemplateParameter {
  parameter_name?: string
}

export type TemplateParameter =
  | (NamedTemplateParameter & { type: 'text'; text: string })
  | (NamedTemplateParameter & {
      type: 'currency'
      currency: TemplateCurrency
    })
  | (NamedTemplateParameter & {
      type: 'date_time'
      date_time: TemplateDateTime
    })
  | { type: 'image'; image: Image }
  | { type: 'document'; document: Document }
  | { type: 'video'; video: Video }
  | { type: 'location'; location: LocationContent }

export type TemplateButtonComponent =
  | {
      type: 'button'
      sub_type: 'quick_reply'
      index: number | string
      parameters: [{ type: 'payload'; payload: string }]
    }
  | {
      type: 'button'
      sub_type: 'url'
      index: number | string
      parameters: [{ type: 'text'; text: string }]
    }
  | {
      type: 'button'
      sub_type: 'copy_code'
      index: number | string
      parameters: [{ type: 'coupon_code'; coupon_code: string }]
    }
  | {
      type: 'button'
      sub_type: 'catalog' | 'CATALOG' | 'flow'
      index: number | string
      parameters: [
        {
          type: 'action'
          action: {
            flow_token?: string
            flow_action_data?: Record<string, unknown>
            thumbnail_product_retailer_id?: string
          }
        },
      ]
    }

export type TemplateComponent =
  | { type: 'header'; parameters: TemplateParameter[] }
  | { type: 'body'; parameters: TemplateParameter[] }
  | TemplateButtonComponent

export interface Template {
  name: string
  language: {
    code: string
    policy?: 'deterministic'
  }
  components?: TemplateComponent[]
}

export interface AudioMessage extends ContextualMessageBase {
  type: 'audio'
  audio: Audio
}

export interface ContactsMessage extends ContextualMessageBase {
  type: 'contacts'
  contacts: Contact[]
}

export interface DocumentMessage extends ContextualMessageBase {
  type: 'document'
  document: Document
}

export interface ImageMessage extends ContextualMessageBase {
  type: 'image'
  image: Image
}

export interface InteractiveMessage extends ContextualMessageBase {
  type: 'interactive'
  interactive: Interactive
}

export interface LocationMessage extends ContextualMessageBase {
  type: 'location'
  location: LocationContent
}

export interface ReactionMessage extends MessageBase {
  type: 'reaction'
  reaction: { message_id: string; emoji: string }
}

export interface StickerMessage extends ContextualMessageBase {
  type: 'sticker'
  sticker: Sticker
}

export interface TemplateMessage extends ContextualMessageBase {
  type: 'template'
  template: Template
}

export interface TextMessage extends ContextualMessageBase {
  type: 'text'
  text: TextContent
}

export interface VideoMessage extends ContextualMessageBase {
  type: 'video'
  video: Video
}

export type SendMessageInput =
  | AudioMessage
  | ContactsMessage
  | DocumentMessage
  | ImageMessage
  | InteractiveMessage
  | LocationMessage
  | ReactionMessage
  | StickerMessage
  | TemplateMessage
  | TextMessage
  | VideoMessage

export type SendAudioMessageInput = Omit<AudioMessage, 'type'>
export type SendContactsMessageInput = Omit<ContactsMessage, 'type'>
export type SendDocumentMessageInput = Omit<DocumentMessage, 'type'>
export type SendImageMessageInput = Omit<ImageMessage, 'type'>
export type SendInteractiveMessageInput = Omit<InteractiveMessage, 'type'>
export type SendLocationMessageInput = Omit<LocationMessage, 'type'>
export type SendReactionMessageInput = Omit<ReactionMessage, 'type'>
export type SendStickerMessageInput = Omit<StickerMessage, 'type'>
export type SendTemplateMessageInput = Omit<TemplateMessage, 'type'>
export type SendTextMessageInput = Omit<TextMessage, 'type'>
export type SendVideoMessageInput = Omit<VideoMessage, 'type'>

export interface MarkMessageReadRequest {
  messaging_product: 'whatsapp'
  status: 'read'
  message_id: string
}

export interface ShowTypingIndicatorRequest extends MarkMessageReadRequest {
  typing_indicator: { type: 'text' }
}

export interface MessageActionResponse {
  success: true
}

export type WhatsAppMessageRequest = SendMessageInput extends infer Message
  ? Message extends SendMessageInput
    ? Message & { messaging_product: 'whatsapp' }
    : never
  : never

export interface SendMessageResponse {
  messaging_product: 'whatsapp'
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string; message_status?: string }>
}

export interface SendOptions {
  signal?: AbortSignal
}
