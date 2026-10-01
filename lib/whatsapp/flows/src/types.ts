export type FlowCategory =
  | 'APPOINTMENT_BOOKING'
  | 'CONTACT_US'
  | 'CUSTOMER_SUPPORT'
  | 'LEAD_GENERATION'
  | 'OTHER'
  | 'SIGN_IN'
  | 'SIGN_UP'
  | 'SURVEY'

export type FlowStatus = 'DEPRECATED' | 'DRAFT' | 'PUBLISHED'

export interface FlowValidationError {
  error?: string
  error_type?: string
  message?: string
  line_start?: number
  line_end?: number
  column_start?: number
  column_end?: number
  [key: string]: unknown
}

export interface FlowPreview {
  preview_url: string
  expires_at: string | number
  [key: string]: unknown
}

export interface WhatsAppFlow {
  id: string
  name?: string
  status?: FlowStatus
  categories?: FlowCategory[]
  validation_errors?: FlowValidationError[]
  json_version?: string
  data_api_version?: string
  data_channel_uri?: string
  endpoint_uri?: string
  preview?: FlowPreview
  health_status?: Record<string, unknown>
  whatsapp_business_account?: Record<string, unknown>
  application?: Record<string, unknown>
  [key: string]: unknown
}

export interface FlowPaging {
  cursors?: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface FlowPage {
  data: WhatsAppFlow[]
  paging?: FlowPaging
  [key: string]: unknown
}

export interface CreateFlowInput {
  name: string
  categories: FlowCategory[]
  clone_flow_id?: string
  endpoint_uri?: string
}

export interface CreateFlowResponse {
  id: string
}

export interface ListFlowsOptions {
  fields?: string[]
  limit?: number
  before?: string
  after?: string
  signal?: AbortSignal
}

export interface GetFlowOptions {
  fields?: string[]
  signal?: AbortSignal
}

export interface GetFlowPreviewOptions {
  invalidate?: boolean
  unixTimestamp?: boolean
  signal?: AbortSignal
}

export interface FlowPreviewResponse {
  id: string
  preview: FlowPreview
}

export interface MigrateFlowsInput {
  source_waba_id: string
  source_flow_names?: string[]
}

export interface MigratedFlow {
  source_id: string
  source_name: string
  migrated_id: string
  [key: string]: unknown
}

export interface FailedFlowMigration {
  source_name: string
  error_code: string | number
  error_message: string
  [key: string]: unknown
}

export interface MigrateFlowsResponse {
  migrated_flows: MigratedFlow[]
  failed_flows: FailedFlowMigration[]
}

export interface UpdateFlowMetadataInput {
  name?: string
  categories?: FlowCategory[]
  endpoint_uri?: string
}

export interface UploadFlowJsonInput {
  file: Blob
  filename?: string
}

export interface UploadFlowJsonResponse {
  success: true
  validation_errors: FlowValidationError[]
}

export interface FlowAsset {
  name: string
  asset_type: 'FLOW_JSON'
  download_url: string
  [key: string]: unknown
}

export interface FlowAssetPage {
  data: FlowAsset[]
  paging?: FlowPaging
  [key: string]: unknown
}

export type FlowMetricName =
  | 'ENDPOINT_AVAILABILITY'
  | 'ENDPOINT_REQUEST_COUNT'
  | 'ENDPOINT_REQUEST_ERROR'
  | 'ENDPOINT_REQUEST_ERROR_RATE'
  | 'ENDPOINT_REQUEST_LATENCY_SECONDS_CEIL'

export type FlowMetricGranularity = 'DAY' | 'LIFETIME'

export interface GetFlowMetricOptions {
  name: FlowMetricName
  granularity: FlowMetricGranularity
  since: string | Date
  until: string | Date
  signal?: AbortSignal
}

export interface FlowMetricValue {
  key: string
  value: number
  [key: string]: unknown
}

export interface FlowMetricDataPoint {
  timestamp: string
  data: FlowMetricValue[]
  [key: string]: unknown
}

export interface FlowMetric {
  name: FlowMetricName
  granularity: FlowMetricGranularity
  data_points: FlowMetricDataPoint[]
  [key: string]: unknown
}

export interface FlowMetricResponse {
  id: string
  metric: FlowMetric
}

export type EncryptionKeySignatureStatus =
  'INVALID' | 'MISMATCH' | 'NOT_VERIFIED' | 'VALID'

export interface EncryptionPublicKey {
  business_public_key: string
  business_public_key_signature_status: EncryptionKeySignatureStatus
  [key: string]: unknown
}

export interface EncryptionPublicKeyResponse {
  data: EncryptionPublicKey[]
}

export interface SetEncryptionPublicKeyInput {
  business_public_key: string
}

export interface SuccessResponse {
  success: true
}

export interface FlowRequestOptions {
  signal?: AbortSignal
}
