export interface ModerationRequestOptions {
  signal?: AbortSignal
}

export interface ListBlockedUsersOptions extends ModerationRequestOptions {
  limit?: number
  before?: string
  after?: string
}

export interface BlockedUser {
  messaging_product: 'whatsapp'
  wa_id: string
  [key: string]: unknown
}

export interface ModerationPaging {
  cursors?: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface BlockedUsersPage {
  data: BlockedUser[]
  paging?: ModerationPaging
  [key: string]: unknown
}

export interface ModerationErrorData {
  details?: string
  [key: string]: unknown
}

export interface ModerationUserError {
  message: string
  code: number
  error_data?: ModerationErrorData
  [key: string]: unknown
}

export interface ModeratedUser {
  input: string
  wa_id: string
  [key: string]: unknown
}

export interface FailedModeratedUser {
  input: string
  wa_id?: string
  errors: ModerationUserError[]
  [key: string]: unknown
}

export interface ModerationPartialError {
  message: string
  type?: string
  code?: number
  error_subcode?: number
  error_data?: ModerationErrorData
  fbtrace_id?: string
  [key: string]: unknown
}

export interface BlockUsersResponse {
  messaging_product: 'whatsapp'
  block_users: {
    added_users: ModeratedUser[]
    failed_users?: FailedModeratedUser[]
    [key: string]: unknown
  }
  error?: ModerationPartialError
  [key: string]: unknown
}

export interface UnblockUsersResponse {
  messaging_product: 'whatsapp'
  block_users: {
    removed_users: ModeratedUser[]
    failed_users?: FailedModeratedUser[]
    [key: string]: unknown
  }
  error?: ModerationPartialError
  [key: string]: unknown
}
