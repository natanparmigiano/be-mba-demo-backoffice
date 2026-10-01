export type TemplateCategory =
  'AUTHENTICATION' | 'FREE_SERVICE' | 'MARKETING' | 'UTILITY'
export type CreatableTemplateCategory = Exclude<
  TemplateCategory,
  'FREE_SERVICE'
>
export type TemplateParameterFormat = 'NAMED' | 'POSITIONAL'
export type TemplateDisplayFormat = 'ORDER_DETAILS'
export type TemplateSendType = 'campaign' | 'direct'
export type TemplateSubCategory =
  | 'BOOKING_STATUS'
  | 'CALL_PERMISSIONS_REQUEST'
  | 'FLIGHT_DELAY_AND_GATE_CHANGE_ALERT'
  | 'FRAUD_ALERT'
  | 'ORDER_DETAILS'
  | 'ORDER_STATUS'
  | 'RICH_ORDER_STATUS'
export type TemplateStatus =
  | 'APPROVED'
  | 'ARCHIVED'
  | 'DELETED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'LIMIT_EXCEEDED'
  | 'PAUSED'
  | 'PENDING'
  | 'PENDING_DELETION'
  | 'REJECTED'

export interface NamedParameterExample {
  param_name: string
  example: string
}

export interface TemplateComponentExample {
  header_handle?: string[]
  header_text?: string[]
  header_text_named_params?: NamedParameterExample[]
  body_text?: string[][]
  body_text_named_params?: NamedParameterExample[]
  [key: string]: unknown
}

export interface SupportedApp {
  package_name: string
  signature_hash: string
}

export type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
  | { type: 'URL'; text: string; url: string; example?: string[] }
  | { type: 'COPY_CODE'; example: string }
  | {
      type: 'OTP'
      otp_type: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP'
      text?: string
      autofill_text?: string
      package_name?: string
      signature_hash?: string
      supported_apps?: SupportedApp[]
      zero_tap_terms_accepted?: boolean
    }
  | {
      type: 'FLOW'
      text: string
      flow_id?: string
      flow_name?: string
      flow_json?: string
      flow_action?: 'data_exchange' | 'navigate'
      navigate_screen?: string
    }
  | { type: 'CATALOG'; text: string }
  | { type: 'MPM'; text: string }
  | { type: 'SPM'; text: string }
  | { type: 'VOICE_CALL'; text: string }
  | { type: 'APP'; text: string; package_name?: string }

export type TemplateComponent =
  | {
      type: 'HEADER'
      format: 'TEXT'
      text: string
      example?: TemplateComponentExample
    }
  | {
      type: 'HEADER'
      format: 'DOCUMENT' | 'IMAGE' | 'VIDEO'
      example: TemplateComponentExample
    }
  | { type: 'HEADER'; format: 'LOCATION' }
  | {
      type: 'BODY'
      text?: string
      example?: TemplateComponentExample
      add_security_recommendation?: boolean
    }
  | {
      type: 'FOOTER'
      text?: string
      code_expiration_minutes?: number
    }
  | { type: 'BUTTONS'; buttons: TemplateButton[] }
  | {
      type: 'CAROUSEL'
      cards: Array<{ components: TemplateComponent[] }>
    }
  | {
      type: 'LIMITED_TIME_OFFER'
      limited_time_offer: { text: string; has_expiration: boolean }
    }

export interface CreateTemplateInput {
  name: string
  language: string
  category: CreatableTemplateCategory
  components: TemplateComponent[]
  parameter_format?: TemplateParameterFormat
  allow_category_change?: boolean
  cta_url_link_tracking_opted_out?: boolean
  message_send_ttl_seconds?: number
  sub_category?: TemplateSubCategory
  display_format?: TemplateDisplayFormat
  is_primary_device_delivery_only?: boolean
  send_type?: TemplateSendType
}

export interface LibraryTemplateButtonInput {
  type:
    | 'APP'
    | 'CATALOG'
    | 'FLOW'
    | 'MPM'
    | 'OTP'
    | 'PHONE_NUMBER'
    | 'QUICK_REPLY'
    | 'URL'
    | 'VOICE_CALL'
  phone_number?: string
  url?: { base_url: string; url_suffix_example?: string }
  zero_tap_terms_accepted?: boolean
  otp_type?: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP'
  supported_apps?: SupportedApp[]
}

export interface CreateLibraryTemplateInput {
  name: string
  language: string
  category: CreatableTemplateCategory
  library_template_name: string
  library_template_button_inputs?: LibraryTemplateButtonInput[]
  library_template_body_inputs?: {
    add_contact_number?: boolean
    add_learn_more_link?: boolean
    add_security_recommendation?: boolean
    add_track_package_link?: boolean
    code_expiration_minutes?: number
  }
}

export interface CreateTemplateResponse {
  id: string
  status: TemplateStatus
  category: TemplateCategory
}

export interface WhatsAppTemplate {
  id: string
  name?: string
  language?: string
  status?: TemplateStatus
  category?: TemplateCategory
  previous_category?: TemplateCategory
  correct_category?: TemplateCategory
  sub_category?: TemplateSubCategory
  parameter_format?: TemplateParameterFormat
  components?: TemplateComponent[]
  cta_url_link_tracking_opted_out?: boolean
  display_format?: TemplateDisplayFormat
  is_primary_device_delivery_only?: boolean
  is_sms_fallback_enabled?: boolean
  message_send_ttl_seconds?: number | null
  library_template_name?: string
  last_updated_time?: number
  source?: 'auto_generated' | 'manual'
  health_status?: { can_send_message?: string; [key: string]: unknown }
  quality_score?: {
    score?: 'GREEN' | 'RED' | 'UNKNOWN' | 'YELLOW'
    reason?: string
    reasons?: string[]
    date?: number
  }
  rejected_reason?:
    | 'ABUSIVE_CONTENT'
    | 'CATEGORY_NOT_AVAILABLE'
    | 'INCORRECT_CATEGORY'
    | 'INVALID_FORMAT'
    | 'NONE'
    | 'PROMOTIONAL'
    | 'SCAM'
    | 'TAG_CONTENT_MISMATCH'
  ad_account_id?: string
  ad_adset_id?: string
  ad_campaign_id?: string
  ad_id?: string
  bid_spec?: { bid_strategy?: string; bid_amount?: number }
  degrees_of_freedom_spec?: Record<string, unknown>
  [key: string]: unknown
}

export interface Paging {
  cursors?: { before?: string; after?: string }
  previous?: string
  next?: string
}

export interface TemplatePage {
  data: WhatsAppTemplate[]
  paging?: Paging
}

export interface ListTemplatesOptions {
  name?: string
  language?: string
  category?: TemplateCategory
  status?: TemplateStatus
  fields?: string[]
  limit?: number
  before?: string
  after?: string
  signal?: AbortSignal
}

export interface GetTemplateOptions {
  fields?: string[]
  signal?: AbortSignal
}

type RequireAtLeastOne<T> = {
  [Key in keyof T]-?: Required<Pick<T, Key>> & Partial<Omit<T, Key>>
}[keyof T]

export type UpdateTemplateInput = RequireAtLeastOne<{
  category: CreatableTemplateCategory
  components: TemplateComponent[]
  parameter_format: TemplateParameterFormat
  allow_category_change: boolean
  message_send_ttl_seconds: number
  cta_url_link_tracking_opted_out: boolean
  sub_category: TemplateSubCategory
  display_format: TemplateDisplayFormat
  is_primary_device_delivery_only: boolean
}>

export interface SuccessResponse {
  success: true
}

export interface RequestOptions {
  signal?: AbortSignal
}

export interface UpsertAuthenticationTemplatesInput {
  name: string
  languages: string[]
  category: 'AUTHENTICATION'
  components: TemplateComponent[]
  message_send_ttl_seconds?: number
}

export interface UpsertedAuthenticationTemplate {
  id: string
  status: TemplateStatus
  language: string
}

export interface UpsertAuthenticationTemplatesResponse {
  data: UpsertedAuthenticationTemplate[]
}

export interface MigrateTemplatesInput {
  source_waba_id: string
  page_number?: number
  count?: number
  template_ids?: string[]
}

export interface MigrateTemplatesResponse {
  migrated_templates: string[]
  failed_templates: Record<string, string>
}

export type TemplateLibraryIndustry = 'E_COMMERCE' | 'FINANCIAL_SERVICES'
export type TemplateLibraryTopic =
  'ACCOUNT_UPDATE' | 'CUSTOMER_FEEDBACK' | 'ORDER_MANAGEMENT' | 'PAYMENTS'

export interface ListTemplateLibraryOptions {
  search?: string
  topic?: TemplateLibraryTopic
  usecase?: string
  industry?: TemplateLibraryIndustry
  language?: string
  name?: string
  limit?: number
  before?: string
  after?: string
  signal?: AbortSignal
}

export interface LibraryTemplate {
  id: string
  name?: string
  language?: string
  category?: TemplateCategory
  topic?: TemplateLibraryTopic
  usecase?: string
  industry?: TemplateLibraryIndustry[]
  header?: string
  body?: string
  footer?: string
  body_params?: string[]
  body_param_types?: string[]
  buttons?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface TemplateLibraryPage {
  data: LibraryTemplate[]
  paging?: Paging
}

export interface CreateTemplateGroupInput {
  name: string
  description?: string
  whatsapp_business_templates: Array<string | number>
}

export interface UpdateTemplateGroupInput {
  name?: string
  description?: string
  add_templates?: Array<string | number>
  remove_templates?: Array<string | number>
}

export interface TemplateGroup {
  id: string
  name?: string
  description?: string
  creation_time?: string
  update_time?: string
  whatsapp_business_account?: Record<string, unknown>
  whatsapp_business_templates?: TemplatePage
  [key: string]: unknown
}

export interface TemplateNamespaceResponse {
  id: string
  message_template_namespace: string
}
