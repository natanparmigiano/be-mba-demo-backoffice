export interface WabaRequestOptions {
  signal?: AbortSignal
}

export interface ListWabasOptions extends WabaRequestOptions {
  limit?: number
  before?: string
  after?: string
}

export interface WhatsAppBusinessAccount {
  id: string
  name?: string
  currency?: string
  timezone_id?: string
  message_template_namespace?: string
  [key: string]: unknown
}

export interface WabaPaging {
  cursors?: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface WabaPage {
  data: WhatsAppBusinessAccount[]
  paging?: WabaPaging
  [key: string]: unknown
}
