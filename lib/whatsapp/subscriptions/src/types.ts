export interface SubscriptionAppData {
  id: string
  link?: string
  name?: string
  [key: string]: unknown
}

export interface WhatsAppSubscription {
  whatsapp_business_api_data: SubscriptionAppData
  override_callback_uri?: string
  [key: string]: unknown
}

export interface SubscriptionPaging {
  cursors?: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface SubscriptionPage {
  data: WhatsAppSubscription[]
  paging?: SubscriptionPaging
  [key: string]: unknown
}

export interface OverrideCallbackInput {
  override_callback_uri: string
  verify_token: string
}

export interface SuccessResponse {
  success: true
}

export interface SubscriptionRequestOptions {
  signal?: AbortSignal
}
