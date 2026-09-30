import { z } from 'zod'
import {
  messagingValueBaseSchema,
  webhookErrorSchema,
  webhookTimestampSchema,
  whatsappContactSchema,
} from './common.js'
import { whatsappMessageSchema } from './messages.js'
import { whatsappStatusSchema } from './statuses.js'

export const messagesValueCommonSchema = messagingValueBaseSchema.extend({
  contacts: z.array(whatsappContactSchema).optional(),
})

export const incomingMessagesValueSchema = messagesValueCommonSchema.extend({
  messages: z.array(whatsappMessageSchema),
  standby: z.never().optional(),
  statuses: z.never().optional(),
})

// Meta Business AI sends agent-owned inbound messages here instead of in
// `messages`. Items retain the normal Cloud API message shape.
export const standbyMessagesValueSchema = messagesValueCommonSchema.extend({
  standby: z.array(whatsappMessageSchema),
  messages: z.never().optional(),
  statuses: z.never().optional(),
})

export const messageStatusesValueSchema = messagesValueCommonSchema.extend({
  statuses: z.array(whatsappStatusSchema),
  messages: z.never().optional(),
  standby: z.never().optional(),
})

export const messageErrorsValueSchema = messagesValueCommonSchema.extend({
  errors: z.array(webhookErrorSchema),
  messages: z.never().optional(),
  standby: z.never().optional(),
  statuses: z.never().optional(),
})

export const messagesValueSchema = z.union([
  incomingMessagesValueSchema,
  standbyMessagesValueSchema,
  messageStatusesValueSchema,
  messageErrorsValueSchema,
])

export const accountAlertInfoSchema = z.looseObject({
  alert_severity: z.enum(['CRITICAL', 'INFORMATIONAL', 'WARNING']),
  alert_status: z.enum(['ACTIVE', 'NONE']),
  alert_type: z.string(),
  alert_description: z.string(),
})

export const accountAlertValueSchema = z.looseObject({
  entity_type: z.enum(['BUSINESS', 'PHONE_NUMBER', 'CURRENT_STATUS_ID']),
  entity_id: z.string(),
  alert_info: accountAlertInfoSchema,
})

export const accountReviewValueSchema = z.looseObject({
  decision: z.enum(['APPROVED', 'REJECTED', 'PENDING', 'DEFERRED']),
})

export const accountUpdateValueSchema = z.looseObject({
  event: z.enum([
    'ACCOUNT_DELETED',
    'ACCOUNT_OFFBOARDED',
    'ACCOUNT_RECONNECTED',
    'ACCOUNT_RESTRICTION',
    'ACCOUNT_VIOLATION',
    'AD_ACCOUNT_LINKED',
    'AUTH_INTL_PRICE_ELIGIBILITY_UPDATE',
    'BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE',
    'DISABLED_UPDATE',
    'MM_LITE_TERMS_SIGNED',
    'PARTNER_ADDED',
    'PARTNER_APP_INSTALLED',
    'PARTNER_APP_UNINSTALLED',
    'PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE',
    'PARTNER_REMOVED',
    'VOLUME_BASED_PRICING_TIER_UPDATE',
  ]),
  country: z.string().optional(),
  waba_info: z
    .looseObject({
      waba_id: z.string(),
      owner_business_id: z.string(),
      ad_account_linked: z.string().optional(),
      partner_app_id: z.string().optional(),
      solution_id: z.string().optional(),
      solution_partner_business_ids: z.array(z.string()).optional(),
    })
    .optional(),
  violation_info: z.looseObject({ violation_type: z.string() }).optional(),
  auth_international_rate_eligibility: z
    .looseObject({
      exception_countries: z.array(
        z.looseObject({
          country_code: z.string(),
          start_time: z.number(),
        }),
      ),
      start_time: z.number(),
    })
    .optional(),
  ban_info: z
    .looseObject({
      waba_ban_state: z.enum(['DISABLE', 'REINSTATE', 'SCHEDULE_FOR_DISABLE']),
      waba_ban_date: z.string(),
    })
    .optional(),
  volume_tier_info: z
    .looseObject({
      tier_update_time: z.number(),
      pricing_category: z.string(),
      tier: z.string(),
      effective_month: z.string(),
      region: z.string(),
    })
    .optional(),
  disconnection_info: z
    .looseObject({
      reason: z.string(),
      initiated_by: z.enum(['SYSTEM', 'USER']),
    })
    .optional(),
  partner_client_certification_info: z
    .looseObject({
      client_business_id: z.string(),
      status: z.enum(['APPROVED', 'DISCARDED', 'FAILED', 'PENDING', 'REVOKED']),
      rejection_reasons: z.array(z.string()).optional(),
    })
    .optional(),
  restriction_info: z
    .array(
      z.looseObject({
        restriction_type: z.string(),
        expiration: z.number(),
        remediation: z.string().optional(),
      }),
    )
    .optional(),
})

export const automaticEventSchema = z.looseObject({
  id: z.string(),
  event_name: z.string(),
  timestamp: webhookTimestampSchema,
  ctwa_clid: z.string(),
  custom_data: z
    .looseObject({
      currency: z.string(),
      value: z.number(),
    })
    .optional(),
})

export const automaticEventsValueSchema = messagingValueBaseSchema.extend({
  automatic_events: z.array(automaticEventSchema),
})

export const businessCapabilityValueSchema = z.looseObject({
  max_daily_conversation_per_phone: z.number().optional(),
  max_daily_conversations_per_business: z
    .union([z.number(), z.string()])
    .optional(),
  max_phone_numbers_per_business: z.number().optional(),
  max_phone_numbers_per_waba: z.number().optional(),
})

export const historyMessageSchema = z.looseObject({
  from: z.string(),
  to: z.string().optional(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  history_context: z
    .looseObject({
      status: z.string(),
    })
    .optional(),
})

export const historyThreadSchema = z.looseObject({
  id: z.string(),
  messages: z.array(historyMessageSchema),
})

export const historyChunkSchema = z.looseObject({
  metadata: z
    .looseObject({
      phase: z.number(),
      chunk_order: z.number(),
      progress: z.number(),
    })
    .optional(),
  threads: z.array(historyThreadSchema).optional(),
  errors: z.array(webhookErrorSchema).optional(),
})

export const historyValueSchema = z.union([
  messagingValueBaseSchema.extend({
    history: z.array(historyChunkSchema),
    errors: z.never().optional(),
  }),
  messagingValueBaseSchema.extend({
    errors: z.array(webhookErrorSchema),
    history: z.never().optional(),
  }),
  messagingValueBaseSchema.extend({
    messages: z.array(whatsappMessageSchema),
    history: z.never().optional(),
    errors: z.never().optional(),
  }),
])

export const templateButtonSchema = z.looseObject({
  message_template_button_type: z.string(),
  message_template_button_text: z.string(),
  message_template_button_url: z.string().optional(),
  message_template_button_phone_number: z.string().optional(),
})

export const messageTemplateComponentsValueSchema = z.looseObject({
  message_template_id: z.union([z.number(), z.string()]),
  message_template_name: z.string(),
  message_template_language: z.string(),
  message_template_element: z.string(),
  message_template_title: z.string().optional(),
  message_template_footer: z.string().optional(),
  message_template_buttons: z.array(templateButtonSchema).optional(),
})

export const messageTemplateQualityValueSchema = z.looseObject({
  previous_quality_score: z.string(),
  new_quality_score: z.string(),
  message_template_id: z.union([z.number(), z.string()]),
  message_template_name: z.string(),
  message_template_language: z.string(),
})

export const messageTemplateStatusValueSchema = z.looseObject({
  event: z.string(),
  message_template_id: z.union([z.number(), z.string()]),
  message_template_name: z.string(),
  message_template_language: z.string(),
  reason: z.string().nullish(),
  message_template_category: z.string().optional(),
  disable_info: z
    .looseObject({ disable_date: webhookTimestampSchema })
    .optional(),
  other_info: z
    .looseObject({
      title: z.string(),
      description: z.string(),
    })
    .optional(),
  rejection_info: z
    .looseObject({
      reason: z.string(),
      recommendation: z.string(),
    })
    .optional(),
})

export const partnerSolutionsValueSchema = z.looseObject({
  event: z.string(),
  solution_id: z.string(),
  solution_status: z.string(),
})

export const paymentConfigurationValueSchema = z.looseObject({
  configuration_name: z.string(),
  provider_name: z.string(),
  provider_mid: z.string(),
  status: z.string(),
  created_timestamp: webhookTimestampSchema,
  updated_timestamp: webhookTimestampSchema,
})

export const phoneNumberNameValueSchema = z.looseObject({
  display_phone_number: z.string(),
  decision: z.string(),
  requested_verified_name: z.string(),
  rejection_reason: z.string().nullish(),
})

export const phoneNumberQualityValueSchema = z.looseObject({
  display_phone_number: z.string(),
  event: z.string(),
  old_limit: z.union([z.string(), z.number()]).optional(),
  current_limit: z.union([z.string(), z.number()]).optional(),
  max_daily_conversations_per_business: z
    .union([z.string(), z.number()])
    .optional(),
})

export const securityValueSchema = z.looseObject({
  display_phone_number: z.string(),
  event: z.string(),
  requester: z.string().optional(),
})

export const smbContactStateSchema = z.looseObject({
  type: z.literal('contact'),
  contact: z.looseObject({
    full_name: z.string().optional(),
    first_name: z.string().optional(),
    phone_number: z.string(),
  }),
  action: z.string(),
  metadata: z.looseObject({
    timestamp: z.string(),
  }),
})

export const smbAppStateSyncValueSchema = messagingValueBaseSchema.extend({
  state_sync: z.array(smbContactStateSchema),
})

export const messageEchoSchema = z.looseObject({
  from: z.string(),
  to: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
})

export const smbMessageEchoesValueSchema = messagingValueBaseSchema.extend({
  message_echoes: z.array(messageEchoSchema),
})

export const templateCategoryValueSchema = z.looseObject({
  message_template_id: z.union([z.number(), z.string()]),
  message_template_name: z.string(),
  message_template_language: z.string(),
  correct_category: z.string().optional(),
  previous_category: z.string().optional(),
  new_category: z.string(),
  category_update_timestamp: webhookTimestampSchema.optional(),
})

export const userPreferenceSchema = z.looseObject({
  wa_id: z.string(),
  detail: z.string(),
  category: z.literal('marketing_messages'),
  value: z.string(),
  timestamp: webhookTimestampSchema,
})

export const userPreferencesValueSchema = messagingValueBaseSchema.extend({
  contacts: z.array(whatsappContactSchema).optional(),
  user_preferences: z.array(userPreferenceSchema),
})

// Meta Business Agents delivers ownership handovers and agent lifecycle
// notifications through the `messaging_handovers` subscription. Meta may add
// event-specific properties, so these objects stay loose while the stable
// routing and correlation fields are typed.
export const businessAgentSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
})

export const messagingHandoverEventSchema = z.looseObject({
  id: z.string(),
  event: z.string(),
  event_type: z.string().optional(),
  timestamp: webhookTimestampSchema,
  conversation_id: z.string().optional(),
  user_id: z.string().optional(),
  previous_owner: z.string().optional(),
  new_owner: z.string().optional(),
  agent: businessAgentSchema.optional(),
})

export const messagingHandoversValueSchema = messagingValueBaseSchema.extend({
  contacts: z.array(whatsappContactSchema).optional(),
  messaging_handovers: z.array(messagingHandoverEventSchema),
})

export const callSessionSchema = z.looseObject({
  sdp_type: z.enum(['offer', 'answer']),
  sdp: z.string(),
})

export const callSchema = z.looseObject({
  id: z.string(),
  to: z.string().optional(),
  to_user_id: z.string().optional(),
  to_parent_user_id: z.string().optional(),
  from: z.string().optional(),
  from_user_id: z.string().optional(),
  from_parent_user_id: z.string().optional(),
  event: z.enum(['connect', 'call_created', 'terminate']),
  timestamp: z.string(),
  direction: z.enum(['BUSINESS_INITIATED', 'USER_INITIATED']),
  session: callSessionSchema.optional(),
  biz_opaque_callback_data: z.string().optional(),
  status: z.enum(['FAILED', 'COMPLETED']).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  duration: z.number().optional(),
})

export const callStatusSchema = z.looseObject({
  id: z.string(),
  timestamp: z.string(),
  type: z.literal('call'),
  status: z.enum(['RINGING', 'ACCEPTED', 'REJECTED']),
  recipient_id: z.string().optional(),
  recipient_user_id: z.string().optional(),
  recipient_parent_user_id: z.string().optional(),
  biz_opaque_callback_data: z.string().optional(),
})

export const callsValueSchema = messagingValueBaseSchema.extend({
  contacts: z.array(whatsappContactSchema).optional(),
  calls: z.array(callSchema).optional(),
  statuses: z.array(callStatusSchema).optional(),
  errors: z.array(webhookErrorSchema).optional(),
})

export const groupParticipantSchema = z.looseObject({
  input: z.string().optional(),
  wa_id: z.string().optional(),
  errors: z.array(webhookErrorSchema).optional(),
})

export const groupUpdateSchema = z.looseObject({
  timestamp: webhookTimestampSchema,
  group_id: z.string(),
  type: z.string(),
  request_id: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  invite_link: z.string().optional(),
  join_approval_mode: z.string().optional(),
  reason: z.string().optional(),
  join_request_id: z.string().optional(),
  wa_id: z.string().optional(),
  initiated_by: z.string().optional(),
  added_participants: z.array(groupParticipantSchema).optional(),
  removed_participants: z.array(groupParticipantSchema).optional(),
  failed_participants: z.array(groupParticipantSchema).optional(),
  profile_picture: z.record(z.string(), z.unknown()).optional(),
  group_subject: z.record(z.string(), z.unknown()).optional(),
  group_description: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(webhookErrorSchema).optional(),
})

export const groupValueSchema = messagingValueBaseSchema.extend({
  groups: z.array(groupUpdateSchema),
})

export const genericWebhookValueSchema = z.record(z.string(), z.unknown())

export type MessagesValue = z.infer<typeof messagesValueSchema>
export type StandbyMessagesValue = z.infer<typeof standbyMessagesValueSchema>
export type HistoryValue = z.infer<typeof historyValueSchema>
export type HistoryMessage = z.infer<typeof historyMessageSchema>
export type MessageEcho = z.infer<typeof messageEchoSchema>
export type Call = z.infer<typeof callSchema>
export type CallStatus = z.infer<typeof callStatusSchema>
export type GroupUpdate = z.infer<typeof groupUpdateSchema>
export type MessagingHandoverEvent = z.infer<
  typeof messagingHandoverEventSchema
>
export type MessagingHandoversValue = z.infer<
  typeof messagingHandoversValueSchema
>
export type SmbContactState = z.infer<typeof smbContactStateSchema>
export type UserPreference = z.infer<typeof userPreferenceSchema>
