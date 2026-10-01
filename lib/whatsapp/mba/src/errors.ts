interface StandardApiErrorBody {
  title?: unknown
  detail?: unknown
  type?: unknown
  status?: unknown
}

interface GraphApiErrorBody {
  error?: {
    message?: unknown
    type?: unknown
    code?: unknown
    error_subcode?: unknown
    fbtrace_id?: unknown
    is_transient?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class WhatsAppMbaApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly title?: string
  readonly detail?: string
  readonly errorType?: string
  readonly code?: number
  readonly subcode?: number
  readonly traceId?: string
  readonly isTransient?: boolean

  constructor(status: number, body: unknown) {
    const standard = isRecord(body) ? (body as StandardApiErrorBody) : undefined
    const graph = isRecord(body) ? (body as GraphApiErrorBody).error : undefined
    const graphError = isRecord(graph) ? graph : undefined
    const detail =
      typeof standard?.detail === 'string' ? standard.detail : undefined
    const title =
      typeof standard?.title === 'string' ? standard.title : undefined
    const graphMessage =
      typeof graphError?.message === 'string' ? graphError.message : undefined

    super(
      detail ??
        graphMessage ??
        title ??
        `Meta Business Agent API request failed with status ${status}`,
    )
    this.name = 'WhatsAppMbaApiError'
    this.status = status
    this.body = body
    this.title = title
    this.detail = detail
    this.errorType =
      typeof graphError?.type === 'string'
        ? graphError.type
        : typeof standard?.type === 'string'
          ? standard.type
          : undefined
    this.code =
      typeof graphError?.code === 'number' ? graphError.code : undefined
    this.subcode =
      typeof graphError?.error_subcode === 'number'
        ? graphError.error_subcode
        : undefined
    this.traceId =
      typeof graphError?.fbtrace_id === 'string'
        ? graphError.fbtrace_id
        : undefined
    this.isTransient =
      typeof graphError?.is_transient === 'boolean'
        ? graphError.is_transient
        : undefined
  }
}

export class WhatsAppMbaResponseError extends Error {
  readonly body: unknown

  constructor(message: string, body: unknown, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WhatsAppMbaResponseError'
    this.body = body
  }
}
