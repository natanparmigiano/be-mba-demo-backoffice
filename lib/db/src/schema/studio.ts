import { organization } from './auth.js'
import {
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const studioSchema = pgSchema('studio')

export const studioProjects = studioSchema.table(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    filePath: text('file_path').notNull().unique(),
    conversation: jsonb('conversation')
      .$type<unknown[]>()
      .default([])
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastEditedAt: timestamp('last_edited_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('projects_organization_last_opened_idx').on(
      table.organizationId,
      table.lastOpenedAt,
    ),
    index('projects_organization_name_idx').on(
      table.organizationId,
      table.name,
    ),
  ],
)
