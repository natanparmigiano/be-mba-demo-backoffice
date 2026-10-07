import {
  bigint,
  index,
  integer,
  jsonb,
  pgSchema,
  timestamp,
} from 'drizzle-orm/pg-core'
import { channels } from './chats.js'

export const whatsappSchema = pgSchema('whatsapp')

export const webhooks = whatsappSchema.table(
  'webhooks',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    channelId: bigint('channel_id', { mode: 'number' })
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    payload: jsonb('payload').notNull(),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
    processingStartedAt: timestamp('processing_started_at', {
      withTimezone: true,
    }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
    processingTimeMs: integer('processing_time_ms').notNull(),
    totalTimeMs: integer('total_time_ms').notNull(),
  },
  (table) => [
    index('webhooks_channel_id_arrived_at_idx').on(
      table.channelId,
      table.arrivedAt,
    ),
    index('webhooks_arrived_at_idx').on(table.arrivedAt),
  ],
)
