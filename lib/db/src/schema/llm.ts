import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const llmSchema = pgSchema('llm')

export interface LlmAuthenticationState {
  authenticated: boolean
  method: 'session'
}

export const llmResponseRequests = llmSchema.table(
  'response_requests',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    endpoint: text('endpoint', { enum: ['responses', 'hashbrown'] })
      .default('responses')
      .notNull(),
    userId: text('user_id').notNull(),
    organizationId: text('organization_id'),
    sessionId: text('session_id'),
    authenticationState: jsonb('authentication_state')
      .$type<LlmAuthenticationState>()
      .notNull(),
    model: text('model'),
    streamed: boolean('streamed').default(false).notNull(),
    providerStatus: integer('provider_status').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    tokenUsage: jsonb('token_usage').$type<unknown>(),
    input: jsonb('input').$type<unknown>().notNull(),
    output: jsonb('output').$type<unknown>(),
  },
  (table) => [
    index('response_requests_organization_requested_at_idx').on(
      table.organizationId,
      table.requestedAt,
    ),
    index('response_requests_user_requested_at_idx').on(
      table.userId,
      table.requestedAt,
    ),
    check(
      'response_requests_duration_nonnegative_check',
      sql`${table.durationMs} >= 0`,
    ),
    check(
      'response_requests_provider_status_check',
      sql`${table.providerStatus} BETWEEN 100 AND 599`,
    ),
  ],
)
