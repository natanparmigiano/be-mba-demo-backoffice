export type MessageDirection = 'incoming' | 'outgoing'
export type MessageStatus =
  'sending' | 'error' | 'sent' | 'delivered' | 'read' | 'played'

export interface MessageReaction {
  emoji: string
  count?: number
}

interface MessageBase {
  id: string
  providerMessageId?: string
  direction: MessageDirection
  aiGenerated?: boolean
  sentAt: string
  senderName?: string
  status?: MessageStatus
  reactions?: MessageReaction[]
  forwarded?: boolean
  frequentlyForwarded?: boolean
}

export interface TextMessage extends MessageBase {
  type: 'text'
  text: string
}

export interface ImageMessage extends MessageBase {
  type: 'image'
  url: string
  alt: string
  caption?: string
}

export interface VideoMessage extends MessageBase {
  type: 'video'
  url: string
  mimeType?: string
  caption?: string
}

export interface DocumentMessage extends MessageBase {
  type: 'document'
  fileName: string
  mimeType: string
  url?: string
  size?: string
  caption?: string
}

export interface VoiceMessage extends MessageBase {
  type: 'voice'
  url?: string
  duration?: string
  waveform?: number[]
  progress?: number
}

export interface AudioMessage extends MessageBase {
  type: 'audio'
  url?: string
  title: string
  artist?: string
  duration?: string
}

export interface LocationMessage extends MessageBase {
  type: 'location'
  latitude: number
  longitude: number
  name: string
  address: string
}

export interface ContactField {
  label: 'CELL' | 'HOME' | 'WORK' | 'OTHER'
  value: string
}

export interface ContactAddress {
  label: 'HOME' | 'WORK' | 'OTHER'
  street?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
}

export interface ContactValue {
  formattedName: string
  givenName?: string
  familyName?: string
  organization?: string
  title?: string
  birthday?: string
  phones: ContactField[]
  emails?: ContactField[]
  addresses?: ContactAddress[]
  urls?: ContactField[]
}

export interface ContactMessage extends MessageBase {
  type: 'contact'
  contacts: ContactValue[]
}

export interface LocationRequestMessage extends MessageBase {
  type: 'location-request'
  prompt: string
  buttonLabel: string
}

export interface StickerMessage extends MessageBase {
  type: 'sticker'
  url: string
  alt: string
}

export interface ReplyAction {
  id: string
  title: string
}

export type ReplyActions =
  | readonly [ReplyAction]
  | readonly [ReplyAction, ReplyAction]
  | readonly [ReplyAction, ReplyAction, ReplyAction]

export interface ButtonsMessage extends MessageBase {
  type: 'buttons'
  text: string
  footer?: string
  buttons: ReplyActions
}

export interface ListRow {
  id: string
  title: string
  description?: string
}

export interface ListSection {
  title: string
  rows: ListRow[]
}

export interface ListMessage extends MessageBase {
  type: 'list'
  title: string
  text: string
  buttonLabel: string
  sections: ListSection[]
}

export interface UrlButtonMessage extends MessageBase {
  type: 'url-button'
  text: string
  label: string
  url: string
}

export interface CarouselItem {
  id: string
  imageUrl: string
  imageAlt: string
  title: string
  description?: string
  button?: ReplyAction
}

export interface CarouselMessage extends MessageBase {
  type: 'carousel'
  items: CarouselItem[]
}

export interface ChatTimelineEvent {
  id: string
  type: 'event'
  sentAt: string
  label: string
}

export type ChatMessage =
  | TextMessage
  | ImageMessage
  | VideoMessage
  | DocumentMessage
  | VoiceMessage
  | AudioMessage
  | LocationMessage
  | ContactMessage
  | LocationRequestMessage
  | StickerMessage
  | ButtonsMessage
  | ListMessage
  | UrlButtonMessage
  | CarouselMessage

export type ChatTimelineItem = ChatMessage | ChatTimelineEvent
