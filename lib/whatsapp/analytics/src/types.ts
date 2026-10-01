export type MessagingAnalyticsGranularity = 'HALF_HOUR' | 'DAY' | 'MONTH'
export type AnalyticsGranularity = 'HALF_HOUR' | 'DAILY' | 'MONTHLY'
export type DailyAnalyticsGranularity = 'DAILY'

export type MessagingProductType = 0 | 2 | 100
export type ConversationMetricType = 'CONVERSATION' | 'COST'
export type ConversationCategory =
  'AUTHENTICATION' | 'MARKETING' | 'SERVICE' | 'UTILITY'
export type ConversationType = 'FREE_ENTRY_POINT' | 'FREE_TIER' | 'REGULAR'
export type ConversationDirection =
  'BUSINESS_INITIATED' | 'UNKNOWN' | 'USER_INITIATED'
export type ConversationDimension =
  | 'CONVERSATION_CATEGORY'
  | 'CONVERSATION_DIRECTION'
  | 'CONVERSATION_TYPE'
  | 'COUNTRY'
  | 'PHONE'

export type PricingMetricType = 'COST' | 'VOLUME'
export type PricingType =
  'FREE_CUSTOMER_SERVICE' | 'FREE_ENTRY_POINT' | 'REGULAR'
export type PricingCategory =
  | 'AUTHENTICATION'
  | 'AUTHENTICATION_INTERNATIONAL'
  | 'MARKETING'
  | 'MARKETING_LITE'
  | 'REFERRAL_CONVERSION'
  | 'SERVICE'
  | 'UTILITY'
export type PricingDimension =
  'COUNTRY' | 'PHONE' | 'PRICING_CATEGORY' | 'PRICING_TYPE' | 'TIER'

export type TemplateAnalyticsMetricType =
  | 'APP_ACTIVATIONS'
  | 'APP_ADD_TO_CART'
  | 'APP_CHECKOUTS_INITIATED'
  | 'APP_PURCHASES'
  | 'APP_PURCHASES_CONVERSION_VALUE'
  | 'CLICKED'
  | 'COST'
  | 'DELIVERED'
  | 'READ'
  | 'SENT'
  | 'WEBSITE_ADD_TO_CART'
  | 'WEBSITE_CHECKOUTS_INITIATED'
  | 'WEBSITE_PURCHASES'
  | 'WEBSITE_PURCHASES_CONVERSION_VALUE'
export type TemplateAnalyticsProductType =
  'CLOUD_API' | 'MARKETING_MESSAGES_API_FOR_WHATSAPP'
export type TemplateGroupAnalyticsMetricType =
  'CLICKED' | 'COST' | 'DELIVERED' | 'READ' | 'SENT'

export type CallDirection = 'BUSINESS_INITIATED' | 'USER_INITIATED'
export type CallDimension = 'COUNTRY' | 'DIRECTION' | 'PHONE'
export type CallMetricType = 'AVERAGE_DURATION' | 'COST' | 'COUNT'

export type GroupAnalyticsMetricType =
  'DELIVERED' | 'PARTICIPANTS_JOINED' | 'PARTICIPANTS_LEFT' | 'READ' | 'SENT'

export interface AnalyticsRequestOptions {
  signal?: AbortSignal
}

export interface MessagingAnalyticsOptions extends AnalyticsRequestOptions {
  start: number
  end: number
  granularity: MessagingAnalyticsGranularity
  phoneNumbers?: readonly string[]
  productTypes?: readonly MessagingProductType[]
  countryCodes?: readonly string[]
}

export interface ConversationAnalyticsOptions extends AnalyticsRequestOptions {
  start: number
  end: number
  granularity: AnalyticsGranularity
  phoneNumbers?: readonly string[]
  countryCodes?: readonly string[]
  metricTypes?: readonly ConversationMetricType[]
  conversationCategories?: readonly ConversationCategory[]
  conversationTypes?: readonly ConversationType[]
  conversationDirections?: readonly ConversationDirection[]
  dimensions?: readonly ConversationDimension[]
}

export interface PricingAnalyticsOptions extends AnalyticsRequestOptions {
  start: number
  end: number
  granularity: AnalyticsGranularity
  phoneNumbers?: readonly string[]
  countryCodes?: readonly string[]
  metricTypes?: readonly PricingMetricType[]
  pricingTypes?: readonly PricingType[]
  pricingCategories?: readonly PricingCategory[]
  dimensions?: readonly PricingDimension[]
}

export type AnalyticsDate = number | string

export interface TemplateAnalyticsOptions extends AnalyticsRequestOptions {
  start: AnalyticsDate
  end: AnalyticsDate
  granularity: DailyAnalyticsGranularity
  templateIds: readonly string[]
  metricTypes?: readonly TemplateAnalyticsMetricType[]
  productType?: TemplateAnalyticsProductType
  useWabaTimezone?: boolean
}

export interface TemplateGroupAnalyticsOptions extends AnalyticsRequestOptions {
  start: AnalyticsDate
  end: AnalyticsDate
  granularity: DailyAnalyticsGranularity
  templateGroupIds: readonly string[]
  metricTypes?: readonly TemplateGroupAnalyticsMetricType[]
  useWabaTimezone?: boolean
}

export interface CallAnalyticsOptions extends AnalyticsRequestOptions {
  start: number
  end: number
  granularity: AnalyticsGranularity
  phoneNumbers?: readonly string[]
  countryCodes?: readonly string[]
  directions?: readonly CallDirection[]
  dimensions?: readonly CallDimension[]
  metricTypes?: readonly CallMetricType[]
}

export interface GroupAnalyticsOptions extends AnalyticsRequestOptions {
  start: number
  end: number
  groupIds: readonly string[]
  metricTypes: readonly GroupAnalyticsMetricType[]
  granularity?: DailyAnalyticsGranularity
}

export interface AnalyticsDataPointBase {
  start: number
  end: number
  [key: string]: unknown
}

export interface MessagingAnalyticsDataPoint extends AnalyticsDataPointBase {
  sent: number
  delivered: number
}

export interface MessagingAnalyticsResponse {
  analytics: {
    phone_numbers: string[]
    country_codes: string[]
    granularity: MessagingAnalyticsGranularity
    data_points: MessagingAnalyticsDataPoint[]
    [key: string]: unknown
  }
  id: string
  [key: string]: unknown
}

export interface ConversationAnalyticsDataPoint extends AnalyticsDataPointBase {
  conversation?: number
  cost?: number
  phone_number?: string
  country?: string
  conversation_type?: ConversationType
  conversation_direction?: ConversationDirection
  conversation_category?: ConversationCategory
}

export interface PricingAnalyticsDataPoint extends AnalyticsDataPointBase {
  volume?: number
  cost?: number
  phone_number?: string
  country?: string
  pricing_type?: PricingType
  pricing_category?: PricingCategory
  tier?: string
}

export interface CallAnalyticsDataPoint extends AnalyticsDataPointBase {
  count?: number
  cost?: number
  average_duration?: number
  phone_number?: string
  country?: string
  direction?: CallDirection
}

export interface AnalyticsSeries<DataPoint extends AnalyticsDataPointBase> {
  data_points: DataPoint[]
  [key: string]: unknown
}

export interface ConversationAnalyticsResponse {
  conversation_analytics: {
    data: Array<AnalyticsSeries<ConversationAnalyticsDataPoint>>
    [key: string]: unknown
  }
  id?: string
  [key: string]: unknown
}

export interface PricingAnalyticsResponse {
  pricing_analytics: {
    data: Array<AnalyticsSeries<PricingAnalyticsDataPoint>>
    [key: string]: unknown
  }
  id?: string
  [key: string]: unknown
}

export interface CallAnalyticsResponse {
  call_analytics: {
    granularity: AnalyticsGranularity
    data_points: CallAnalyticsDataPoint[]
    [key: string]: unknown
  }
  id?: string
  [key: string]: unknown
}

export interface AnalyticsCostMetric {
  type: string
  value: number
  [key: string]: unknown
}

export interface AnalyticsClickMetric {
  type: string
  button_content?: string
  count: number
  [key: string]: unknown
}

export interface TemplateAnalyticsDataPoint extends AnalyticsDataPointBase {
  template_id: string
  sent?: number
  delivered?: number
  read?: number
  clicked?: AnalyticsClickMetric[]
  cost?: AnalyticsCostMetric[]
}

export interface TemplateGroupAnalyticsDataPoint extends AnalyticsDataPointBase {
  template_group_id: string
  sent?: number
  delivered?: number
  read?: number
  clicked?: AnalyticsClickMetric[]
  cost?: AnalyticsCostMetric[]
}

export interface GroupAnalyticsDataPoint extends AnalyticsDataPointBase {
  group_id: string
  sent?: number
  delivered?: number
  read?: number
  joined?: number
  left?: number
}

export interface AnalyticsPaging {
  cursors?: {
    before?: string
    after?: string
    [key: string]: unknown
  }
  previous?: string
  next?: string
  [key: string]: unknown
}

export interface AnalyticsPage<DataPoint extends AnalyticsDataPointBase> {
  data: Array<AnalyticsSeries<DataPoint>>
  paging?: AnalyticsPaging
  [key: string]: unknown
}

export type TemplateAnalyticsResponse =
  AnalyticsPage<TemplateAnalyticsDataPoint>
export type TemplateGroupAnalyticsResponse =
  AnalyticsPage<TemplateGroupAnalyticsDataPoint>
export type GroupAnalyticsResponse = AnalyticsPage<GroupAnalyticsDataPoint>

export interface EnableTemplateAnalyticsResponse {
  id: string
  [key: string]: unknown
}
