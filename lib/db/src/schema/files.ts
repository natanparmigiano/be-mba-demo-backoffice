import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  pgSchema,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const filesSchema = pgSchema('files')

const bytea = customType<{ data: Uint8Array }>({
  dataType: () => 'bytea',
})

// WARNING: This table is only a convenience fallback for short-lived demos and
// quick testing on platforms without a persistent filesystem (for example,
// Render). PostgreSQL is not an object store: keeping arbitrary file blobs here
// increases database size, backup/restore time, replication traffic, and memory
// pressure. Production deployments should use the S3-compatible files driver.
export const storedFiles = filesSchema.table(
  '__files',
  {
    path: text('path').primaryKey(),
    blob: bytea('blob').notNull(),
    contentType: text('content_type'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      '__files_path_length_check',
      sql`octet_length(${table.path}) BETWEEN 1 AND 1024`,
    ),
  ],
)
