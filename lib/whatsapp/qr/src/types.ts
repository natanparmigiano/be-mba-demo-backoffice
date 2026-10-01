export type QrCodeImageFormat = 'PNG' | 'SVG'

export type QrCodeField = 'code' | 'prefilled_message' | 'deep_link_url'

export interface QrRequestOptions {
  signal?: AbortSignal
}

export interface CreateQrCodeInput {
  prefilled_message: string
  generate_qr_image?: QrCodeImageFormat
}

export interface UpdateQrCodeInput {
  prefilled_message: string
}

export interface ListQrCodesOptions extends QrRequestOptions {
  fields?: QrCodeField[]
  imageFormat?: QrCodeImageFormat
  limit?: number
  before?: string
  after?: string
}

export interface MessageQrCode {
  code: string
  prefilled_message?: string
  deep_link_url?: string
  qr_image_url?: string
  [key: string]: unknown
}

export interface MessageQrCodeImage extends MessageQrCode {
  qr_image_url: string
}

export interface QrPaging {
  cursors?: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface QrCodePage {
  data: MessageQrCode[]
  paging?: QrPaging
  [key: string]: unknown
}

export interface SuccessResponse {
  success: true
}
