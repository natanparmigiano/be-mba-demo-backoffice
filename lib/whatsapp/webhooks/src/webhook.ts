import { z } from 'zod'
import {
  accountAlertValueSchema,
  accountReviewValueSchema,
  accountUpdateValueSchema,
  automaticEventsValueSchema,
  businessCapabilityValueSchema,
  callsValueSchema,
  genericWebhookValueSchema,
  groupValueSchema,
  historyValueSchema,
  messagesValueSchema,
  messageTemplateComponentsValueSchema,
  messageTemplateQualityValueSchema,
  messageTemplateStatusValueSchema,
  messagingHandoversValueSchema,
  partnerSolutionsValueSchema,
  paymentConfigurationValueSchema,
  phoneNumberNameValueSchema,
  phoneNumberQualityValueSchema,
  securityValueSchema,
  smbAppStateSyncValueSchema,
  smbMessageEchoesValueSchema,
  standbyValueSchema,
  templateCategoryValueSchema,
  userPreferencesValueSchema,
} from './events.js'

export const accountAlertsChangeSchema = z.looseObject({
  field: z.literal('account_alerts'),
  value: accountAlertValueSchema,
})

export const accountReviewUpdateChangeSchema = z.looseObject({
  field: z.literal('account_review_update'),
  value: accountReviewValueSchema,
})

export const accountUpdateChangeSchema = z.looseObject({
  field: z.literal('account_update'),
  value: accountUpdateValueSchema,
})

export const automaticEventsChangeSchema = z.looseObject({
  field: z.literal('automatic_events'),
  value: automaticEventsValueSchema,
})

export const businessCapabilityUpdateChangeSchema = z.looseObject({
  field: z.literal('business_capability_update'),
  value: businessCapabilityValueSchema,
})

export const callsChangeSchema = z.looseObject({
  field: z.literal('calls'),
  value: callsValueSchema,
})

export const groupLifecycleUpdateChangeSchema = z.looseObject({
  field: z.literal('group_lifecycle_update'),
  value: groupValueSchema,
})

export const groupParticipantsUpdateChangeSchema = z.looseObject({
  field: z.literal('group_participants_update'),
  value: groupValueSchema,
})

export const groupSettingsUpdateChangeSchema = z.looseObject({
  field: z.literal('group_settings_update'),
  value: groupValueSchema,
})

export const groupStatusUpdateChangeSchema = z.looseObject({
  field: z.literal('group_status_update'),
  value: groupValueSchema,
})

export const historyChangeSchema = z.looseObject({
  field: z.literal('history'),
  value: historyValueSchema,
})

export const messagesChangeSchema = z.looseObject({
  field: z.literal('messages'),
  value: messagesValueSchema,
})

export const standbyChangeSchema = z.looseObject({
  field: z.literal('standby'),
  value: standbyValueSchema,
})

export const messageTemplateComponentsUpdateChangeSchema = z.looseObject({
  field: z.literal('message_template_components_update'),
  value: messageTemplateComponentsValueSchema,
})

export const messageTemplateQualityUpdateChangeSchema = z.looseObject({
  field: z.literal('message_template_quality_update'),
  value: messageTemplateQualityValueSchema,
})

export const messageTemplateStatusUpdateChangeSchema = z.looseObject({
  field: z.literal('message_template_status_update'),
  value: messageTemplateStatusValueSchema,
})

export const partnerSolutionsChangeSchema = z.looseObject({
  field: z.literal('partner_solutions'),
  value: partnerSolutionsValueSchema,
})

export const paymentConfigurationUpdateChangeSchema = z.looseObject({
  field: z.literal('payment_configuration_update'),
  value: paymentConfigurationValueSchema,
})

export const phoneNumberNameUpdateChangeSchema = z.looseObject({
  field: z.literal('phone_number_name_update'),
  value: phoneNumberNameValueSchema,
})

export const phoneNumberQualityUpdateChangeSchema = z.looseObject({
  field: z.literal('phone_number_quality_update'),
  value: phoneNumberQualityValueSchema,
})

export const securityChangeSchema = z.looseObject({
  field: z.literal('security'),
  value: securityValueSchema,
})

export const smbAppStateSyncChangeSchema = z.looseObject({
  field: z.literal('smb_app_state_sync'),
  value: smbAppStateSyncValueSchema,
})

export const smbMessageEchoesChangeSchema = z.looseObject({
  field: z.literal('smb_message_echoes'),
  value: smbMessageEchoesValueSchema,
})

export const templateCategoryUpdateChangeSchema = z.looseObject({
  field: z.literal('template_category_update'),
  value: templateCategoryValueSchema,
})

export const userPreferencesChangeSchema = z.looseObject({
  field: z.literal('user_preferences'),
  value: userPreferencesValueSchema,
})

// These fields remain in Graph API subscription surfaces but do not have a
// stable public payload reference. Their envelopes are typed and their values
// are intentionally lossless until Meta publishes a stable component schema.
export const businessStatusUpdateChangeSchema = z.looseObject({
  field: z.literal('business_status_update'),
  value: genericWebhookValueSchema,
})

export const flowsChangeSchema = z.looseObject({
  field: z.literal('flows'),
  value: genericWebhookValueSchema,
})

export const messageEchoesChangeSchema = z.looseObject({
  field: z.literal('message_echoes'),
  value: genericWebhookValueSchema,
})

export const messagingHandoversChangeSchema = z.looseObject({
  field: z.literal('messaging_handovers'),
  value: messagingHandoversValueSchema,
})

export const trackingEventsChangeSchema = z.looseObject({
  field: z.literal('tracking_events'),
  value: genericWebhookValueSchema,
})

export const whatsappWebhookChangeSchema = z.discriminatedUnion('field', [
  accountAlertsChangeSchema,
  accountReviewUpdateChangeSchema,
  accountUpdateChangeSchema,
  automaticEventsChangeSchema,
  businessCapabilityUpdateChangeSchema,
  businessStatusUpdateChangeSchema,
  callsChangeSchema,
  flowsChangeSchema,
  groupLifecycleUpdateChangeSchema,
  groupParticipantsUpdateChangeSchema,
  groupSettingsUpdateChangeSchema,
  groupStatusUpdateChangeSchema,
  historyChangeSchema,
  messageEchoesChangeSchema,
  messagesChangeSchema,
  messagingHandoversChangeSchema,
  messageTemplateComponentsUpdateChangeSchema,
  messageTemplateQualityUpdateChangeSchema,
  messageTemplateStatusUpdateChangeSchema,
  partnerSolutionsChangeSchema,
  paymentConfigurationUpdateChangeSchema,
  phoneNumberNameUpdateChangeSchema,
  phoneNumberQualityUpdateChangeSchema,
  securityChangeSchema,
  smbAppStateSyncChangeSchema,
  smbMessageEchoesChangeSchema,
  standbyChangeSchema,
  templateCategoryUpdateChangeSchema,
  trackingEventsChangeSchema,
  userPreferencesChangeSchema,
])

export const whatsappWebhookEntrySchema = z.looseObject({
  id: z.string(),
  time: z.number().optional(),
  changes: z.array(whatsappWebhookChangeSchema).min(1),
})

export const whatsappWebhookSchema = z.looseObject({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(whatsappWebhookEntrySchema).min(1),
})

export type WhatsAppWebhookChange = z.infer<typeof whatsappWebhookChangeSchema>
export type WhatsAppWebhookEntry = z.infer<typeof whatsappWebhookEntrySchema>
export type WhatsAppWebhook = z.infer<typeof whatsappWebhookSchema>
