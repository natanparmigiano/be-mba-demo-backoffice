import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organization } from './auth.js'
import { channels } from './mba.js'

export const runnerSchema = pgSchema('runner')

export const runnerFunctionStatuses = ['active', 'archived'] as const
export const runnerParameterTypes = [
  'boolean',
  'integer',
  'json',
  'number',
  'string',
] as const
export const runnerExecutionStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'timed_out',
] as const

export type RunnerFunctionStatus = (typeof runnerFunctionStatuses)[number]
export type RunnerParameterType = (typeof runnerParameterTypes)[number]
export type RunnerExecutionStatus = (typeof runnerExecutionStatuses)[number]

export const runnerFunctions = runnerSchema.table(
  'functions',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: runnerFunctionStatuses })
      .default('active')
      .notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('functions_organization_id_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    uniqueIndex('functions_id_organization_id_uidx').on(
      table.id,
      table.organizationId,
    ),
    index('functions_organization_id_status_idx').on(
      table.organizationId,
      table.status,
    ),
    check(
      'functions_current_revision_positive_check',
      sql`${table.currentRevision} > 0`,
    ),
    check(
      'functions_archive_state_check',
      sql`(${table.status} = 'active' AND ${table.archivedAt} IS NULL) OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
    ),
  ],
)

export const runnerFunctionRevisions = runnerSchema.table(
  'function_revisions',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    functionId: bigint('function_id', { mode: 'number' })
      .notNull()
      .references(() => runnerFunctions.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('function_revisions_function_id_revision_uidx').on(
      table.functionId,
      table.revision,
    ),
    uniqueIndex('function_revisions_id_function_id_uidx').on(
      table.id,
      table.functionId,
    ),
    index('function_revisions_function_id_idx').on(table.functionId),
    check(
      'function_revisions_revision_positive_check',
      sql`${table.revision} > 0`,
    ),
    check(
      'function_revisions_code_not_empty_check',
      sql`length(${table.code}) > 0`,
    ),
  ],
)

export const runnerRevisionParameters = runnerSchema.table(
  'revision_parameters',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    revisionId: bigint('revision_id', { mode: 'number' })
      .notNull()
      .references(() => runnerFunctionRevisions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: runnerParameterTypes }).notNull(),
    required: boolean('required').default(true).notNull(),
    position: integer('position').notNull(),
    description: text('description'),
  },
  (table) => [
    uniqueIndex('revision_parameters_revision_id_name_uidx').on(
      table.revisionId,
      table.name,
    ),
    uniqueIndex('revision_parameters_revision_id_position_uidx').on(
      table.revisionId,
      table.position,
    ),
    index('revision_parameters_revision_id_idx').on(table.revisionId),
    check(
      'revision_parameters_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
)

export const runnerMcps = runnerSchema.table(
  'mcps',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('mcps_organization_id_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    uniqueIndex('mcps_id_organization_id_uidx').on(
      table.id,
      table.organizationId,
    ),
    index('mcps_organization_id_updated_at_idx').on(
      table.organizationId,
      table.updatedAt,
    ),
  ],
)

export const runnerMcpFunctions = runnerSchema.table(
  'mcp_functions',
  {
    mcpId: bigint('mcp_id', { mode: 'number' }).notNull(),
    functionId: bigint('function_id', { mode: 'number' }).notNull(),
    organizationId: text('organization_id').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.mcpId, table.functionId],
      name: 'mcp_functions_pkey',
    }),
    foreignKey({
      columns: [table.mcpId, table.organizationId],
      foreignColumns: [runnerMcps.id, runnerMcps.organizationId],
      name: 'mcp_functions_mcp_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.functionId, table.organizationId],
      foreignColumns: [runnerFunctions.id, runnerFunctions.organizationId],
      name: 'mcp_functions_function_organization_fk',
    }).onDelete('restrict'),
    uniqueIndex('mcp_functions_mcp_id_position_uidx').on(
      table.mcpId,
      table.position,
    ),
    index('mcp_functions_function_id_idx').on(table.functionId),
    index('mcp_functions_organization_id_idx').on(table.organizationId),
    check(
      'mcp_functions_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
)

export const runnerFunctionApiKeys = runnerSchema.table(
  'function_api_keys',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    allowedFunctionIds: bigint('allowed_function_ids', {
      mode: 'number',
    }).array(),
    allowedMcpIds: bigint('allowed_mcp_ids', { mode: 'number' }).array(),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('function_api_keys_key_hash_uidx').on(table.keyHash),
    uniqueIndex('function_api_keys_id_organization_id_uidx').on(
      table.id,
      table.organizationId,
    ),
    index('function_api_keys_organization_id_idx').on(table.organizationId),
    index('function_api_keys_expires_at_idx').on(table.expiresAt),
    check(
      'function_api_keys_expiration_after_creation_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
)

export const runnerAgentMcpConnectors = runnerSchema.table(
  'agent_mcp_connectors',
  {
    channelId: bigint('channel_id', { mode: 'number' }).notNull(),
    mcpId: bigint('mcp_id', { mode: 'number' }).notNull(),
    connectorId: text('connector_id').notNull(),
    apiKeyId: bigint('api_key_id', { mode: 'number' }).notNull(),
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.channelId, table.mcpId],
      name: 'agent_mcp_connectors_pkey',
    }),
    foreignKey({
      columns: [table.channelId, table.organizationId],
      foreignColumns: [channels.id, channels.organizationId],
      name: 'agent_mcp_connectors_channel_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.mcpId, table.organizationId],
      foreignColumns: [runnerMcps.id, runnerMcps.organizationId],
      name: 'agent_mcp_connectors_mcp_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.apiKeyId, table.organizationId],
      foreignColumns: [
        runnerFunctionApiKeys.id,
        runnerFunctionApiKeys.organizationId,
      ],
      name: 'agent_mcp_connectors_api_key_organization_fk',
    }).onDelete('restrict'),
    uniqueIndex('agent_mcp_connectors_channel_connector_uidx').on(
      table.channelId,
      table.connectorId,
    ),
    index('agent_mcp_connectors_mcp_id_idx').on(table.mcpId),
    index('agent_mcp_connectors_api_key_id_idx').on(table.apiKeyId),
    index('agent_mcp_connectors_organization_id_idx').on(table.organizationId),
  ],
)

export const runnerExecutionLogs = runnerSchema.table(
  'execution_logs',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text('organization_id').notNull(),
    functionId: bigint('function_id', { mode: 'number' }).notNull(),
    revisionId: bigint('revision_id', { mode: 'number' }).notNull(),
    apiKeyId: bigint('api_key_id', { mode: 'number' }),
    status: text('status', { enum: runnerExecutionStatuses })
      .default('queued')
      .notNull(),
    arguments: jsonb('arguments').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<unknown>(),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.functionId, table.organizationId],
      foreignColumns: [runnerFunctions.id, runnerFunctions.organizationId],
      name: 'execution_logs_function_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.revisionId, table.functionId],
      foreignColumns: [
        runnerFunctionRevisions.id,
        runnerFunctionRevisions.functionId,
      ],
      name: 'execution_logs_revision_function_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.apiKeyId, table.organizationId],
      foreignColumns: [
        runnerFunctionApiKeys.id,
        runnerFunctionApiKeys.organizationId,
      ],
      name: 'execution_logs_api_key_organization_fk',
    }).onDelete('restrict'),
    index('execution_logs_organization_id_started_at_idx').on(
      table.organizationId,
      table.startedAt,
    ),
    index('execution_logs_function_id_started_at_idx').on(
      table.functionId,
      table.startedAt,
    ),
    index('execution_logs_revision_id_idx').on(table.revisionId),
    index('execution_logs_api_key_id_idx').on(table.apiKeyId),
    check(
      'execution_logs_duration_nonnegative_check',
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
    check(
      'execution_logs_terminal_state_check',
      sql`(${table.status} IN ('queued', 'running') AND ${table.finishedAt} IS NULL AND ${table.durationMs} IS NULL) OR (${table.status} NOT IN ('queued', 'running') AND ${table.finishedAt} IS NOT NULL AND ${table.durationMs} IS NOT NULL)`,
    ),
  ],
)
