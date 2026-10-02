# `@mba-demo/db`

This package is the authoritative PostgreSQL boundary. It owns the lazy
Postgres.js connection, Drizzle registry, schemas, and migration runtime.
Organization ownership is the tenant boundary for application data, while
provider IDs and unique indexes make webhook persistence retry-safe.

## Public API

```ts
import { db, closeDatabase, type Database } from '@mba-demo/db'
import * as schema from '@mba-demo/db/schema'
```

`db` is initialized with the complete schema registry, enabling Drizzle relational queries and type inference. `closeDatabase()` drains the underlying Postgres.js client and should be called during process shutdown.

## Connection behavior

`DATABASE_URL` must use `postgres://` or `postgresql://`.

- Development falls back to `postgresql://postgres:postgres@localhost:5432/mba_demo_backoffice`.
- Production requires an explicit `DATABASE_URL`.
- Provider-specific `verifySSL` query parameters are removed before connecting;
  Postgres.js otherwise forwards them as unsupported PostgreSQL settings. Use
  the supported `ssl` or `sslmode` parameters to configure transport security.
- The pool allows one connection outside production and ten in production.
- Idle connections time out after 20 seconds; connection attempts after 10 seconds.

Postgres.js connects lazily, so importing the package does not by itself open a connection.

## Schema organization

Each file under `src/schema` represents a PostgreSQL schema or schema group:

| File        | PostgreSQL schema | Ownership                                                    |
| ----------- | ----------------- | ------------------------------------------------------------ |
| `auth.ts`   | `auth`            | Better Auth generated tables and relations                   |
| `files.ts`  | `files`           | Non-production PostgreSQL file-storage fallback              |
| `mba.ts`    | `mba`             | Application-owned WhatsApp chat data                         |
| `runner.ts` | `runner`          | Versioned functions, MCP packs, API keys, and execution logs |
| `index.ts`  | —                 | Re-exports the complete registry for Drizzle                 |

### Runner functions

`runner.functions` stores organization-scoped function identity and lifecycle
state. Source is immutable in `runner.function_revisions`, while
`runner.revision_parameters` stores each revision's ordered typed contract.
`runner.mcps` stores organization-scoped function packs and
`runner.mcp_functions` preserves their ordered, same-organization membership.
`runner.function_api_keys` stores only hashes of expiring, revocable keys scoped
to an organization. Its nullable `allowed_function_ids` and `allowed_mcp_ids`
arrays grant the union of individual functions and every function currently in
the selected MCP packs; both `NULL` allows every function in the organization.
`runner.execution_logs` is also the durable runner-work queue. It records the
exact revision, API key, validated input, `queued`/`running` state, terminal
status, JSON result or bounded error, duration, and timestamps. Workers claim a
row by atomically moving it from `queued` to `running`.
Archiving retains all revisions and logs.
Permanent function deletion is explicit: active executions block it, while
terminal logs and MCP membership are removed before the function deletion
cascades to revisions and revision parameters. Direct function IDs are also
removed from organization API-key allowlists in the same transaction.

When adding a schema file, export it from `src/schema/index.ts`. Drizzle Kit reads `src/schema/*.ts`, while runtime consumers receive the registry through `@mba-demo/db/schema`.

Never hand-edit `auth.ts`; regenerate it with `yarn auth:generate` after Better
Auth configuration or plugin changes.

`files.__files` stores a path and binary body for the PostgreSQL files adapter.
It exists only to support quick testing and short-lived demos without a
persistent filesystem. It is not recommended for production or general use;
production deployments should use the S3-compatible files adapter.

### MBA chats and messages

`mba.channels` owns a human-readable channel name, WhatsApp phone-number configuration, and sensitive credentials for an application agent. Every channel belongs to exactly one Better Auth `auth.organization`; the indexed foreign key is the tenant boundary. `mba.contacts` and `mba.groups` reference their channel and store provider identities plus current metadata. Both feed `mba.chats`, which gives every direct or group message stream a durable application identity. Chats also retain channel and organization foreign keys as deliberate denormalizations for indexed tenant inbox pagination. Neither group webhook state nor chat activity deletes these records.

`mba.messages` stores the current WhatsApp message projection and belongs to a chat. Its optional `contact_id` identifies the remote direct-chat contact or the sender represented by a group message. Common identifiers, timestamps, forwarding markers, AI-generation provenance, display text, media metadata, outbound template names and their nullable Marketing Messages API flag, the durable file-store key for downloaded media, and typed UI-facing content objects are normalized during ingestion, while the complete deeply typed message remains in JSONB. Incoming messages receive the local `read` status when the chat is handled by the MBA agent and `delivered` otherwise; current outbound delivery status, recipient, Meta billing-conversation, pricing, callback, and error data are projected onto the message. AI-owned inbound traffic also advances the local read cursor without increasing the unread count.

`mba.agent_knowledge_file_archives` maps an organization-scoped Meta knowledge
file ID to its durable `@mba-demo/files` storage path. Files configured outside
this application intentionally have no row; agent export treats those entries
as missing rather than failing the complete export.

`mba.agent_backups` records organization- and channel-scoped AGTX snapshots.
The archive bytes live in `@mba-demo/files`; PostgreSQL stores the safe file
name, unique storage path, byte size, and creation time. The composite channel
and organization foreign key prevents cross-tenant backup associations.

`mba.sticker_library` stores organization-scoped, SHA-256-deduplicated WebP
sticker metadata. Sticker bytes remain in `@mba-demo/files`; the database keeps
their unique storage paths, sizes, and creation order.

`mba.message_status_events` preserves the append-only delivery-status history while the provider message ID makes message upserts idempotent. `mba.chat_events` stores non-message activity attached to a chat: billing-window observations, Business Agents ownership handovers and agent events, group changes, calls, call statuses, and user preferences. The model supports incoming `messages`, Business Agents `standby`, history, message echoes, and status-first rows.

`mba.webhooks` is the organization-scoped archival log for successfully
processed webhook envelopes. It preserves the complete JSON payload together
with arrival, processing-start, and completion timestamps plus processing and
end-to-end durations. Channel and arrival indexes support the log viewer's
newest-first cursor pagination and filters.

Channel foreign keys remain restrictive. Application channel deletion performs
an explicit reverse-order cleanup of status events, chat events, messages,
chats, contacts, groups, and archived webhooks inside one transaction before
deleting the channel; it does not add or depend on channel-level database
cascades.

Composite foreign keys enforce that every chat's denormalized channel matches its contact or group and that its denormalized organization matches the channel owner. These keys are maintained by ingestion and cannot drift through direct database writes.

`runner.agent_mcp_connectors` records the local MCP backing a Meta agent
connector, including the channel, provider connector ID, and dedicated runner
API key. Its channel, MCP, and API-key foreign keys are restrictive rather
than cascading, so an active association blocks channel or MCP deletion.

See [`MBA_MESSAGE_MODEL.md`](MBA_MESSAGE_MODEL.md) for field mappings, ordering rules, and the intended ingestion transactions.

## Migration workflow

1. Change or generate the TypeScript schema.
2. Run `yarn db:generate`.
3. Review the generated SQL and metadata under `drizzle/`.
4. Apply it with `yarn db:migrate`.

```bash
yarn db:generate
yarn db:migrate
```

Drizzle Kit loads the root `.env` when present. `drizzle.config.ts` enables strict and verbose operation and writes artifacts to `lib/db/drizzle`.

The production `app` container runs `dist/migrate.js` before starting Hono. The migration executable always closes its database connection and exits non-zero on failure, so the app does not start against a partially migrated database.

Use Drizzle Studio when inspecting local data:

```bash
yarn db:studio
```

## Verification

```bash
yarn workspace @mba-demo/db typecheck
yarn workspace @mba-demo/db test
yarn workspace @mba-demo/db build
```

Environment tests validate development defaults, production requirements, configured URLs, and accepted PostgreSQL protocols.
