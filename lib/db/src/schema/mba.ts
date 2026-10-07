import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organization } from './auth.js'
import { channels } from './chats.js'

export const mbaSchema = pgSchema('mba')

export const agentKnowledgeFileArchives = mbaSchema.table(
  'agent_knowledge_file_archives',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    providerFileId: text('provider_file_id').notNull(),
    storagePath: text('storage_path').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'agent_knowledge_file_archives_pk',
      columns: [table.organizationId, table.providerFileId],
    }),
    uniqueIndex('agent_knowledge_file_archives_storage_path_uidx').on(
      table.storagePath,
    ),
  ],
)

export const agentBackups = mbaSchema.table(
  'agent_backups',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    channelId: bigint('channel_id', { mode: 'number' }).notNull(),
    fileName: text('file_name').notNull(),
    storagePath: text('storage_path').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('agent_backups_storage_path_uidx').on(table.storagePath),
    index('agent_backups_channel_created_id_idx').on(
      table.channelId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'agent_backups_channel_organization_fk',
      columns: [table.channelId, table.organizationId],
      foreignColumns: [channels.id, channels.organizationId],
    }).onDelete('restrict'),
    check('agent_backups_byte_size_check', sql`${table.byteSize} > 0`),
  ],
)

export type AgentKnowledgeFileArchive =
  typeof agentKnowledgeFileArchives.$inferSelect
export type NewAgentKnowledgeFileArchive =
  typeof agentKnowledgeFileArchives.$inferInsert
