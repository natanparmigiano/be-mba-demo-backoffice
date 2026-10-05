import { index, pgSchema, text, timestamp } from 'drizzle-orm/pg-core'

export const kvSchema = pgSchema('kv')

export const keyValueEntries = kvSchema.table(
  'entries',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [index('entries_expires_at_idx').on(table.expiresAt)],
)
