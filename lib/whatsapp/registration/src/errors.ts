interface GraphApiErrorBody {
  error?: {
    message?: unknown
    type?: unknown
    code?: unknown
    error_subcode?: unknown
    fbtrace_id?: unknown
    is_transient?: unknown
    error_user_title?: unknown
    error_user_msg?: unknown
  }
}

function graphError(body: unknown): GraphApiErrorBody['error'] {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return undefined
  }
  const error = (body as GraphApiErrorBody).error
  return typeof error === 'object' && error !== null ? error : undefined
}

export class WhatsAppRegistrationApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly code?: number
  readonly subcode?: number
  readonly errorType?: string
  readonly traceId?: string
  readonly isTransient?: boolean
  readonly userTitle?: string
  readonly userMessage?: string

  constructor(status: number, body: unknown) {
    const error = graphError(body)
    const message =
      typeof error?.message === 'string'
        ? error.message
        : `WhatsApp Graph API request failed with status ${status}`
    super(message)
    this.name = 'WhatsAppRegistrationApiError'
    this.status = status
    this.body = body
    this.code = typeof error?.code === 'number' ? error.code : undefined
    this.subcode =
      typeof error?.error_subcode === 'number' ? error.error_subcode : undefined
    this.errorType = typeof error?.type === 'string' ? error.type : undefined
    this.traceId =
      typeof error?.fbtrace_id === 'string' ? error.fbtrace_id : undefined
    this.isTransient =
      typeof error?.is_transient === 'boolean' ? error.is_transient : undefined
    this.userTitle =
      typeof error?.error_user_title === 'string'
        ? error.error_user_title
        : undefined
    this.userMessage =
      typeof error?.error_user_msg === 'string'
        ? error.error_user_msg
        : undefined
  }
}

export class WhatsAppRegistrationResponseError extends Error {
  readonly body: unknown

  constructor(message: string, body: unknown, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WhatsAppRegistrationResponseError'
    this.body = body
  }
}
