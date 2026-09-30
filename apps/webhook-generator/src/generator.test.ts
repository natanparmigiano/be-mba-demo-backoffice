import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { whatsappWebhookSchema } from '@mba-demo/schemas/wa-cloud/webhooks'
import { SyntheticWebhookGenerator } from './generator.js'
import type { GeneratedWebhook } from './types.js'

const options = {
  contacts: 4,
  displayPhoneNumber: '15550001111',
  groupSize: 3,
  groups: 2,
  phoneNumberId: 'phone-id',
  runId: 'test-run',
  seed: 7,
  wabaId: 'waba-id',
}

describe('SyntheticWebhookGenerator', () => {
  it('creates the configured contact and group pools', () => {
    const generator = new SyntheticWebhookGenerator(
      options,
      () => 1_700_000_000_000,
    )

    assert.equal(generator.pool.contacts.length, 4)
    assert.equal(generator.pool.groups.length, 2)
    assert.equal(generator.pool.groups[0]?.members.length, 3)
    assert.equal(new Set(generator.pool.contacts.map(({ id }) => id)).size, 4)
  })

  it('emits group lifecycle events before group traffic', () => {
    const generator = new SyntheticWebhookGenerator(
      options,
      () => 1_700_000_000_000,
    )

    assert.equal(generator.next().kind, 'group_lifecycle')
    assert.equal(generator.next().kind, 'group_lifecycle')
  })

  it('uses standby only while the MBA agent owns the conversation', () => {
    const generator = new SyntheticWebhookGenerator(
      { ...options, contacts: 1, groups: 0, groupSize: 0 },
      () => 1_700_000_000_000,
    )
    const events = Array.from({ length: 24 }, () => generator.next())
    const firstHandoverIndex = events.findIndex(
      ({ kind }) => kind === 'handover',
    )

    assert.ok(firstHandoverIndex >= 0)
    assert.equal(events[firstHandoverIndex + 1]?.kind, 'standby')

    const secondHandoverIndex = events.findIndex(
      ({ kind }, index) => index > firstHandoverIndex && kind === 'handover',
    )
    assert.ok(secondHandoverIndex > firstHandoverIndex)
    assert.equal(events[secondHandoverIndex + 1]?.kind, 'message')

    for (const event of events) whatsappWebhookSchema.parse(event.payload)
  })

  it('only emits ordered statuses for previously emitted outbound messages', () => {
    const generator = new SyntheticWebhookGenerator(
      { ...options, contacts: 2, groups: 0, groupSize: 0 },
      () => 1_700_000_000_000,
    )
    const outboundIds = new Set<string>()
    const messageIds = new Set<string>()
    const statuses = new Map<string, string[]>()

    for (let index = 0; index < 150; index += 1) {
      const event = generator.next()
      const createdId = getCreatedMessageId(event)
      if (createdId) {
        assert.equal(
          messageIds.has(createdId),
          false,
          `duplicate message ID ${createdId}`,
        )
        messageIds.add(createdId)
        if (event.kind === 'message_echo') outboundIds.add(createdId)
      }

      const status = getStatus(event)
      if (status) {
        assert.equal(outboundIds.has(status.id), true)
        const sequence = statuses.get(status.id) ?? []
        sequence.push(status.status)
        statuses.set(status.id, sequence)
      }
    }

    assert.ok(statuses.size > 0)
    for (const sequence of statuses.values()) {
      assert.deepEqual(sequence, ['sent', 'delivered', 'read'])
    }
  })
})

function getCreatedMessageId(event: GeneratedWebhook): string | undefined {
  const value = firstValue(event)
  const candidate =
    event.kind === 'message_echo'
      ? firstArrayRecord(value, 'message_echoes')
      : event.kind === 'message' || event.kind === 'standby'
        ? firstArrayRecord(
            value,
            event.kind === 'standby' ? 'standby' : 'messages',
          )
        : undefined
  return candidate && typeof candidate.id === 'string'
    ? candidate.id
    : undefined
}

function getStatus(
  event: GeneratedWebhook,
): { id: string; status: string } | undefined {
  if (event.kind !== 'status') return undefined
  const candidate = firstArrayRecord(firstValue(event), 'statuses')
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    typeof candidate.status !== 'string'
  ) {
    return undefined
  }
  return { id: candidate.id, status: candidate.status }
}

function firstValue(event: GeneratedWebhook): Record<string, unknown> {
  const entry = event.payload.entry[0]
  const change = entry?.changes[0]
  assert.ok(change)
  return change.value
}

function firstArrayRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const values = value[key]
  if (!Array.isArray(values)) return undefined
  const first: unknown = values[0]
  return isRecord(first) ? first : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
