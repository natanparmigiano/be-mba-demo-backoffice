import type { WhatsAppWebhook } from '@mba-demo/schemas/wa-cloud/webhooks'

export type ConversationOwner = 'agent' | 'human_app'

export type GeneratedWebhookKind =
  | 'agent_event'
  | 'group_lifecycle'
  | 'group_settings'
  | 'handover'
  | 'message'
  | 'message_echo'
  | 'standby'
  | 'status'

export interface GeneratedWebhook {
  kind: GeneratedWebhookKind
  payload: WhatsAppWebhook
}

export interface SyntheticContact {
  id: string
  name: string
}

export interface SyntheticGroup {
  id: string
  members: readonly SyntheticContact[]
  subject: string
}

export interface GeneratorOptions {
  contacts: number
  displayPhoneNumber: string
  groupSize: number
  groups: number
  phoneNumberId: string
  runId?: string
  seed: number
  wabaId: string
}

export interface GeneratorPool {
  contacts: readonly SyntheticContact[]
  groups: readonly SyntheticGroup[]
}
