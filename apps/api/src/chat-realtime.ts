import type { WhatsAppChatUpdateType } from '@mba-demo/db'
import type { PubSub } from '@mba-demo/pubsub'

export type ChatRealtime = Pick<PubSub, 'publish' | 'start' | 'subscribe'>

export interface ChatRealtimeEvent {
  schemaVersion: 1
  chatId: number
  type: WhatsAppChatUpdateType
  occurredAt: string
}

export function chatRealtimeChannel(chatId: number): string {
  if (!Number.isSafeInteger(chatId) || chatId <= 0) {
    throw new Error('Chat ID must be a positive safe integer')
  }
  return `chats.${chatId}`
}

export function chatInboxRealtimeChannel(organizationId: string): string {
  if (!organizationId.trim()) {
    throw new Error('Organization ID must not be empty')
  }
  return `organizations.${organizationId}.chats`
}

export async function publishChatRealtimeEvent(
  realtime: Pick<PubSub, 'publish'>,
  organizationId: string,
  chatId: number,
  type: WhatsAppChatUpdateType,
  now: () => Date = () => new Date(),
): Promise<void> {
  const event: ChatRealtimeEvent = {
    schemaVersion: 1,
    chatId,
    type,
    occurredAt: now().toISOString(),
  }
  const value = JSON.stringify(event)
  await Promise.all([
    realtime.publish(chatRealtimeChannel(chatId), value),
    realtime.publish(chatInboxRealtimeChannel(organizationId), value),
  ])
}

export async function publishChatRealtimeEventSafely(
  realtime: Pick<PubSub, 'publish'>,
  organizationId: string,
  chatId: number,
  type: WhatsAppChatUpdateType,
): Promise<void> {
  try {
    await publishChatRealtimeEvent(realtime, organizationId, chatId, type)
  } catch (error) {
    console.error(
      'Failed to publish chat realtime event',
      JSON.stringify({ organizationId, chatId, type }),
      error,
    )
  }
}
