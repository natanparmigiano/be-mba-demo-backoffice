import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organization } from './auth.js'
import { channels, chats, messages } from './chats.js'

export const statsSchema = pgSchema('stats')

export const statsEventTypes = [
  'agent_message',
  'human_message',
  'handoff_started',
  'conversation_assigned',
  'first_human_response',
] as const

export type StatsEventType = (typeof statsEventTypes)[number]

/** Append-only facts used for dashboard rates and assignment aggregates. */
export const statsEvents = statsSchema.table(
  'events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    eventKey: text('event_key').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    channelId: bigint('channel_id', { mode: 'number' })
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => chats.id, { onDelete: 'restrict' }),
    messageId: bigint('message_id', { mode: 'number' }).references(
      () => messages.id,
      { onDelete: 'restrict' },
    ),
    eventType: text('event_type', { enum: statsEventTypes }).notNull(),
    teamId: text('team_id'),
    userId: text('user_id'),
    durationMs: integer('duration_ms'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('stats_events_event_key_uidx').on(table.eventKey),
    index('stats_events_organization_channel_occurred_idx').on(
      table.organizationId,
      table.channelId,
      table.occurredAt,
    ),
    index('stats_events_team_occurred_idx').on(
      table.organizationId,
      table.teamId,
      table.occurredAt,
    ),
    index('stats_events_user_occurred_idx').on(
      table.organizationId,
      table.userId,
      table.occurredAt,
    ),
    check(
      'stats_events_duration_nonnegative_check',
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
  ],
)

export type StatsEvent = typeof statsEvents.$inferSelect
export type NewStatsEvent = typeof statsEvents.$inferInsert
