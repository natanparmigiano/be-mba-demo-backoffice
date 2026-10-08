import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chatInboxRealtimeChannel,
  chatRealtimeChannel,
  publishChatRealtimeEvent,
} from './chat-realtime.js'

describe('chat realtime events', () => {
  it('publishes a versioned event to the chat and inbox channels', async () => {
    const published: Array<{ channel: string; value: string }> = []

    await publishChatRealtimeEvent(
      {
        publish: async (channel, value) => {
          published.push({ channel, value })
        },
      },
      'org-one',
      42,
      'message.created',
      () => new Date('2026-09-30T22:30:00.000Z'),
    )

    assert.deepEqual(published, [
      {
        channel: 'chats.42',
        value: JSON.stringify({
          schemaVersion: 1,
          chatId: 42,
          type: 'message.created',
          occurredAt: '2026-09-30T22:30:00.000Z',
        }),
      },
      {
        channel: 'organizations.org-one.chats',
        value: JSON.stringify({
          schemaVersion: 1,
          chatId: 42,
          type: 'message.created',
          occurredAt: '2026-09-30T22:30:00.000Z',
        }),
      },
    ])
  })

  it('rejects invalid chat channel identifiers', () => {
    assert.throws(() => chatRealtimeChannel(0), /positive safe integer/)
    assert.throws(() => chatInboxRealtimeChannel(' '), /must not be empty/)
  })
})
