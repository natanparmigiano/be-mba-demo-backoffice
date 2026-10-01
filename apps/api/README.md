# `@mba-demo/api`

The Hono application is the system's HTTP and process-lifecycle boundary. It
enforces authentication and organization scope, publishes verified webhooks,
optionally runs subscribers in-process, and serves the compiled React app in
production. Its inferred `AppType` is the browser's RPC contract, so keep route
composition chained in `src/app.ts`.

## HTTP surface

| Method                   | Path                                                            | Description                                                              |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET`                    | `/api/health`                                                   | Returns `{ status: "ok", runtime: "node" }`                              |
| `GET`, `POST`            | `/api/auth/*`                                                   | Delegates requests to Better Auth                                        |
| `GET`                    | `/api/auth/sso-availability`                                    | Reports whether any verified SSO provider is ready                       |
| `POST`                   | `/api/events`                                                   | Publishes `{ message, key? }` to `demo.events.v1` and returns `202`      |
| `GET`, `PUT`             | `/api/files/signed`                                             | Filesystem download/upload authorized by an expiring HMAC URL            |
| `GET`                    | `/api/admin/organizations`                                      | Lists organizations for an application administrator                     |
| `GET`                    | `/api/admin/organizations/:id`                                  | Returns administrator-visible organization detail                        |
| `POST`                   | `/api/admin/organizations/:id/members/self`                     | Adds the application administrator as an organization admin              |
| `DELETE`                 | `/api/admin/organizations/:id`                                  | Deletes an organization that has no dependent channel data               |
| `GET`, `POST`            | `/api/channels`                                                 | Lists or creates channels in the active organization                     |
| `GET`, `PATCH`           | `/api/channels/:id/agent-settings`                              | Reads or updates rollout, audience, handoff, and response constraints    |
| `GET`                    | `/api/channels/:id/agent-export`                                | Streams export progress and a portable ZIP-based `.agtx` package         |
| `POST`                   | `/api/channels/:id/agent-import/inspect`                        | Validates AGTX and reports required files and connector secrets          |
| `POST`                   | `/api/channels/:id/agent-import`                                | Reconciles an agent from AGTX while streaming import progress            |
| `GET`                    | `/api/channels/:id/agent-eligibility`                           | Checks Meta agent eligibility for an owned channel                       |
| `GET`, `POST`            | `/api/channels/:id/agent-allowlist`                             | Lists or adds phone numbers allowed to use the agent                     |
| `DELETE`                 | `/api/channels/:id/agent-allowlist/:entryId`                    | Removes a phone number from the agent allowlist                          |
| `GET`, `PUT`             | `/api/channels/:id/agent-business-info`                         | Reads or replaces the agent's business information                       |
| `GET`, `POST`            | `/api/channels/:id/agent-skills`                                | Lists or creates agent skills; titles must use kebab-case                |
| `PUT`, `DELETE`          | `/api/channels/:id/agent-skills/:skillId`                       | Updates or removes an agent skill                                        |
| `GET`, `POST`            | `/api/channels/:id/agent-connectors`                            | Lists or creates snake_case-named agent connectors                       |
| `GET`, `PUT`, `DELETE`   | `/api/channels/:id/agent-connectors/:connectorId`               | Reads, updates, or removes an agent connector                            |
| `GET`                    | `/api/channels/:id/agent-connectors/:connectorId/logs`          | Lists recent connector activity and aggregate statistics                 |
| `GET`, `POST`            | `/api/channels/:id/agent-connectors/:connectorId/tools`         | Lists or creates snake_case-named connector tools                        |
| `PUT`, `DELETE`          | `/api/channels/:id/agent-connectors/:connectorId/tools/:toolId` | Updates or removes a connector tool                                      |
| `GET`                    | `/api/channels/:id/agent-evals`                                 | Lists the evaluation cases available for the agent                       |
| `POST`                   | `/api/channels/:id/agent-evals/runs`                            | Starts an asynchronous evaluation run                                    |
| `GET`                    | `/api/channels/:id/agent-evals/runs/:jobId`                     | Reads evaluation progress and results                                    |
| `GET`                    | `/api/channels/:id/agent-evals/details`                         | Reads evaluation details by comma-separated `ids`                        |
| `GET`                    | `/api/channels/:id/agent-evals/summaries`                       | Reads evaluation summaries by comma-separated `ids`                      |
| `GET`, `POST`            | `/api/channels/:id/agent-knowledge/faqs`                        | Lists or creates agent FAQ entries                                       |
| `PUT`, `DELETE`          | `/api/channels/:id/agent-knowledge/faqs/:faqId`                 | Updates or removes an agent FAQ entry                                    |
| `GET`, `POST`            | `/api/channels/:id/agent-knowledge/websites`                    | Lists or creates agent knowledge websites                                |
| `PUT`, `DELETE`          | `/api/channels/:id/agent-knowledge/websites/:websiteId`         | Updates or removes an agent knowledge website                            |
| `GET`, `POST`            | `/api/channels/:id/agent-knowledge/files`                       | Lists files or proxies a file upload directly to Meta                    |
| `DELETE`                 | `/api/channels/:id/agent-knowledge/files/:fileId`               | Removes an agent knowledge file                                          |
| `POST`, `DELETE`         | `/api/channels/:id/agent`                                       | Onboards or removes a Meta Business Agent for an owned channel           |
| `GET`                    | `/api/channels/:id/verify-token`                                | Returns a channel's webhook verification token to an owner/admin         |
| `POST`                   | `/api/channels/:id/set-webhook`                                 | Configures Meta's webhook override through `@mba-demo/wa-subscriptions`  |
| `GET`                    | `/api/channels/:id/deletion-impact`                             | Counts local contacts, groups, and messages before channel deletion      |
| `PATCH`                  | `/api/channels/:id`                                             | Updates an active-organization channel                                   |
| `DELETE`                 | `/api/channels/:id`                                             | Confirms and manually deletes a channel's local dependency graph         |
| `GET`                    | `/api/playground/registration/:channelId/phone-number`          | Reads registration data for an active-organization channel               |
| `POST`                   | `/api/playground/registration/:channelId/request-code`          | Requests a phone ownership code for an owner/admin                       |
| `POST`                   | `/api/playground/registration/:channelId/verify-code`           | Verifies a phone ownership code for an owner/admin                       |
| `POST`                   | `/api/playground/registration/:channelId/register`              | Registers a channel phone number for an owner/admin                      |
| `POST`                   | `/api/playground/registration/:channelId/two-step-pin`          | Changes a channel phone-number PIN for an owner/admin                    |
| `POST`                   | `/api/playground/registration/:channelId/deregister`            | Deregisters a channel phone number for an owner/admin                    |
| `POST`                   | `/api/playground/messaging/:channelId/send`                     | Sends a typed WhatsApp message for an owner/admin                        |
| `POST`                   | `/api/playground/messaging/:channelId/mark-read`                | Marks an incoming WhatsApp message as read                               |
| `POST`                   | `/api/playground/messaging/:channelId/typing-indicator`         | Marks a message read and displays a typing indicator                     |
| `POST`                   | `/api/playground/messaging/:channelId/media-upload`             | Creates scoped upload and download URLs for playground media             |
| `POST`                   | `/api/playground/media/:channelId/upload`                       | Uploads validated media to Meta for an owner/admin                       |
| `GET`                    | `/api/playground/media/:channelId/:mediaId`                     | Retrieves metadata and a temporary media URL                             |
| `GET`                    | `/api/playground/media/:channelId/:mediaId/download`            | Proxies an authenticated media download                                  |
| `DELETE`                 | `/api/playground/media/:channelId/:mediaId`                     | Deletes channel-owned media for an owner/admin                           |
| `GET`                    | `/api/wa-cloud/webhook/:id`                                     | Completes Meta's challenge using the channel verification token          |
| `POST`                   | `/api/wa-cloud/webhook/:id`                                     | Verifies and publishes a typed webhook to `wa-cloud.webhook.v1`          |
| `GET`                    | `/api/chats`                                                    | Lists active-organization chats with cursor pagination                   |
| `GET`                    | `/api/chats/events`                                             | Streams active-organization inbox invalidations over SSE                 |
| `GET`                    | `/api/chats/:id`                                                | Returns one active-organization chat independently of pagination         |
| `GET`                    | `/api/chats/:id/timeline`                                       | Lists interleaved messages and chat events with cursor pagination        |
| `GET`                    | `/api/chats/:id/events`                                         | Streams organization-authorized chat invalidations over SSE              |
| `GET`                    | `/api/chats/:id/templates`                                      | Lists approved chat-WABA templates with opaque cursor pagination         |
| `POST`                   | `/api/chats/:id/media-upload`                                   | Creates a chat-scoped presigned media staging upload                     |
| `POST`                   | `/api/chats/:id/media`                                          | Uploads staged composer media to WhatsApp                                |
| `POST`                   | `/api/chats/:id/messages`                                       | Sends and persists a non-interactive human-owned chat message            |
| `PATCH`                  | `/api/chats/:id/read`                                           | Marks the latest inbound message at Meta, then advances the local cursor |
| `PATCH`                  | `/api/chats/:id/handoff`                                        | Transfers thread control between a human operator and the Business AI    |
| `GET`                    | `/api/contacts`                                                 | Lists active-organization contacts with search and cursor pagination     |
| `GET`                    | `/api/contacts/:id`                                             | Returns read-only contact details for the active organization            |
| `GET`                    | `/api/groups`                                                   | Lists active-organization groups with search and cursor pagination       |
| `GET`                    | `/api/groups/:id`                                               | Returns read-only group details for the active organization              |
| `POST`                   | `/api/runner/functions`                                         | Creates an organization-scoped versioned JavaScript function             |
| `GET`                    | `/api/runner/functions`                                         | Lists active functions in the active organization                        |
| `GET`                    | `/api/runner/functions/:id`                                     | Returns function detail and immutable revision history                   |
| `GET`                    | `/api/runner/functions/:id/executions`                          | Lists the function's 20 most recent organization-scoped executions       |
| `PATCH`                  | `/api/runner/functions/:id`                                     | Creates a new immutable function revision                                |
| `POST`                   | `/api/runner/functions/:id/archive`                             | Archives a function while retaining revisions and logs                   |
| `POST`                   | `/api/runner/functions/:id/revisions/:revision/restore`         | Copies a selected revision into a new latest revision                    |
| `GET`, `POST`            | `/api/runner/mcps`                                              | Lists or creates organization-scoped MCP function packs                  |
| `GET`, `PATCH`, `DELETE` | `/api/runner/mcps/:id`                                          | Reads, updates, or deletes an MCP pack                                   |
| `POST`                   | `/api/mcp/:mcpId`                                               | Serves one stateless Streamable HTTP MCP server                          |
| `GET`                    | `/api/runner/api-keys`                                          | Lists safe key metadata for the active organization                      |
| `POST`                   | `/api/runner/api-keys`                                          | Creates an expiring organization API key                                 |
| `DELETE`                 | `/api/runner/api-keys/:keyId`                                   | Revokes an organization API key                                          |
| `POST`                   | `/api/runner/functions/:id/execute-ui`                          | Executes through the active organization's managed `UI` key              |
| `POST`                   | `/api/runner/functions/:id/execute`                             | Executes a revision using a valid organization API key                   |

Protected endpoints enforce server-side authorization; browser guards are not
a security boundary. JSON input is validated with Zod. Credentialed CORS
trusts `CORS_ORIGIN`, permits `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and
`OPTIONS`, and allows the `X-API-Key` header.

Runner function reads use the authenticated active organization. Creation,
revision updates and restores, archival, key reads, key creation, and key
revocation require an active-organization owner or admin. External execution
requires an organization key through `Authorization: Bearer <key>` or
`X-API-Key`. The key must match the URL's function through its nullable
allow-list, be unrevoked, and have a future expiration. A `NULL` allow-list
permits every function in the key's organization. Plaintext keys are returned
only when created. Browser test execution uses session authorization and
rotates one short-lived organization key named `UI` instead of creating and
deleting a key for each run.

Every configured MCP is available at `/api/mcp/:mcpId` through the official
MCP Streamable HTTP transport. The route requires
`Authorization: Bearer <runner-key>` on every request, advertises only active
functions covered by the key's effective direct-function and MCP scopes, and
rechecks key validity, membership, and scope before every tool call. It is
stateless, supports the current protocol and the SDK's stateless legacy
fallback, and delegates authorization and worker dispatch to
`@mba-demo/runner`.
`MCP_ALLOWED_HOSTS` supplies the comma-separated public hostnames accepted by
the official Hono adapter and is required in production.

All direct, UI, and MCP runner calls preserve their existing request/response
contracts while executing in the event worker. The API persists a queued
execution and publishes only its ID to `runner.execution.requested.v1`; the
worker claims the row, runs its immutable revision in `isolated-vm`, and stores
the terminal result that the original call awaits. `ENABLE_WORKER_IN_PROCESS`
must remain enabled with the memory event adapter. Separate app and worker
roles require Kafka, as they do for webhook processing.

The API playground resolves Graph API credentials from the selected channel on
the server and never returns the access token to the browser. Phone-number
inspection is available to active organization members; registration mutations
require an organization owner or administrator. Provider calls time out after
15 seconds and expose a stable error shape without returning stored secrets.
Messaging operations also require an owner or administrator. Media files are
uploaded directly from the browser through a five-minute presigned upload URL,
then sent to Meta using a 15-minute presigned download URL. In filesystem mode,
`FILES_PUBLIC_URL` must be reachable by Meta; S3-compatible deployments must
allow browser PUT requests through bucket CORS.

The media-package playground accepts only the MIME types and per-kind limits
defined by `@mba-demo/wa-media`. Active organization members can retrieve media
metadata or download bytes; uploads and deletes require an owner or
administrator. Downloads are authenticated server-side and are returned with
private, no-store caching.

The file route is authentication-by-signature and applies only to filesystem
storage. It rejects expired, tampered, method-mismatched, and signed
content-type-mismatched URLs. S3 mode returns native presigned object-store
URLs, so those transfers do not pass through Hono.

The WA Cloud route accepts a positive numeric channel ID that must resolve to a WhatsApp channel. GET subscription challenges are checked against that channel's `wa_webhook_verify_token`. POST requests are limited to JSON payloads of 1 MiB, verified against the channel's `wa_app_secret` using `X-Hub-Signature-256`, validated with the complete webhook Zod schema, and checked against the channel's WABA and phone-number metadata before publication. Phone-number IDs remain exact; display phone numbers are compared after removing formatting characters. The original body is retained as the event value so signature fidelity and lossless processing are preserved.

The subscriber validates the event again and persists contacts, groups, chats, messages, and message status history in one transaction. For media messages it first uses `@mba-demo/wa-media` to retrieve and authenticate the temporary provider download, then stores the bytes through `@mba-demo/files`. The resulting deterministic, UUID-sharded object key is persisted in `messages.media_file_path`. Failed webhook handling is republished to the established `wa-cloud.webhook.v1` topic with a durable retry count. After `WA_WEBHOOK_MAX_RETRIES` retries (default `5`), the complete original event and final error are published to `wa-cloud.webhook.dead-letter.v1`; successful retry or dead-letter publication lets the failed source offset commit, preventing poison messages from looping forever. Reusing the established source topic also prevents first deliveries from being skipped by a new topic's latest-offset initialization. Retry writes remain idempotent through unique indexes, and out-of-order message statuses cannot regress the current projection.

Contact reads are scoped through each contact's channel to the active organization membership. The list endpoint accepts `search`, `channelId`, `limit`, and an opaque `cursor`, ordered by most recently seen contacts. Full raw provider data is returned only by the detail endpoint.

Agent status and eligibility reads resolve the owned channel's phone-number ID
and system-user access token on the server and query `@mba-demo/wa-mba`. An
empty settings array is `not_configured`; otherwise the rollout flag produces
`enabled` or `disabled`. Eligibility checks require an organization owner or
admin. Agent settings, eligibility, onboarding, and allowlist requests do not
set an application-level response deadline, allowing long-running Meta calls
to complete. Provider settings and credentials are not returned to the
browser. Knowledge-file multipart uploads are sent to `@mba-demo/wa-mba` and
also archived through `@mba-demo/files` so their original bytes can be reused
by agent exports.
Connector reads omit credential values. Connector updates preserve existing
Meta-side credentials unless replacements are explicitly submitted.

Channel deletion is deliberately local-only. Its preview reports persisted
contact, group, and message counts. The confirmed mutation explicitly deletes
message status history, chat events, messages, chats, contacts, groups, and the
channel in one database transaction. It does not invoke any Meta, WhatsApp
Cloud API, or MBA deletion endpoint and does not rely on new cascading foreign
keys.
Agent exports are ZIP-based `.agtx` packages containing a versioned
`agent.yaml` manifest plus a `files/` directory. The manifest contains settings,
allowlists, business information, skills, FAQs, websites, safe connector
configuration and tools, and every Meta knowledge-file reference. Locally
archived knowledge files are included under `files/`; files
configured outside this application remain in the manifest with a null path so
import can request them. The one-shot SSE response reports each collection
phase and streams the package as ordered base64 chunks before its completion
event. API keys, OAuth secrets, and certificates remain import-time
requirements.

Agent import first inspects the untrusted package without changing provider
state. ZIP entry paths, sizes, checksums, the safe YAML subset, manifest schema,
and referenced files are validated before missing file and connector-secret
requirements are returned. The import request supplies those requirements as
multipart fields and receives SSE progress while settings, allowlist, business
information, skills, FAQs, websites, knowledge files, connectors, tools, and
connector certificates are reconciled. Provider request starts are paced at a
maximum of two per second for each import; local archive operations are not
delayed. Failed reads and mutations use five retries with delays of 500 ms, 1
second, 2 seconds, 5 seconds, and 10 seconds. Before retrying a mutation, the
importer reads the affected resource and continues without replaying the write
when the requested state already persisted. If that consistency read cannot
establish the resource state, import stops instead of risking a duplicate.
The manifest's exported rollout value is provenance only: import forces the
destination rollout off at both the beginning and successful end of the
workflow, so a manager must review and enable the agent manually.
Knowledge files are re-archived through `@mba-demo/files`. Evaluation cases are
deliberately outside AGTX because Meta does not expose a creation operation for
them. Meta operations are not transactional; a provider failure can leave an
explicitly reported partial import. Runtime failures are emitted as
`import-error` events with the failed step and a sanitized provider or
validation message. Server output uses `[agent-import]` logs for package
resource counts, stage transitions, provider read and mutation attempts,
consistency-check outcomes, retry delays, local archive writes, and total
duration. Terminal failures include the complete error and cause chain. The
logs never include supplied connector credentials or certificate contents.
Import `progress` SSE events also include `resource`, `completed`, and
`resourceTotal` while a resource collection is being reconciled, allowing the
browser to show item-level progress such as `FAQs: 3/6 completed`.

Group reads use the same organization boundary and cursor contract, ordered by most recently updated groups. Search covers group subjects, descriptions, provider IDs, invitation links, and event types; full raw group events are returned only by the detail endpoint.

Chat inbox reads use the denormalized `chats.organization_id` tenant key and the `(organization_id, updated_at, id)` index. The detail endpoint applies the same tenant boundary but resolves one chat independently of the current cursor page, allowing browser deep links without changing list semantics. Timeline reads perform separate bounded index scans over messages and chat events, merge at most two page-sized result sets, and return them chronologically with one opaque cursor. Message results include their type-specific projections and forwarding markers, and archived media paths are converted to short-lived download URLs without exposing storage keys. This avoids offset scans and an unbounded union sort as chat history grows. The chat read mutation resolves the latest inbound provider message and channel credentials server-side, marks it read through `@mba-demo/wa-messaging`, and only then transactionally advances the local cursor, resets the unread count, and promotes delivered inbound message projections to `read`. Handoff mutations similarly resolve the organization-owned chat and channel credentials server-side, transfer Meta thread control, then update the local owner projection after the provider accepts the request.

Composer sends are accepted only while the conversation is owned by the human
application. The server resolves and overwrites the provider recipient, marks
group destinations explicitly, rejects interactive payloads, sends through
`@mba-demo/wa-messaging`, and persists the accepted outbound projection before
publishing its real-time invalidation. Media is first staged through a
chat-scoped presigned PUT URL and then uploaded to Meta through
`@mba-demo/wa-media`; the staged file key remains the authorized timeline media
source while Meta delivery statuses reconcile by provider message ID. Composer
voice notes are accepted only as `audio/ogg`; prerecorded audio retains the
other media-library formats.

Template discovery resolves the chat's organization-owned channel and queries
its WABA through `@mba-demo/wa-templates`; access tokens never reach the
browser. Only approved definitions are returned, including their language,
components, examples, and parameter format so the composer can build a preview
and typed parameter form. Meta cursors remain opaque and are passed through for
incremental loading.

Inbox SSE connections subscribe to the active organization's
`organizations.<organizationId>.chats` PubSub channel. Exact-chat consumers can
still use the separately authorized `chats.<id>` stream. Webhook transactions
report the organization and affected chat IDs after commit; the worker then
fans `message.created`, `message.status.updated`, or `conversation.updated`
invalidations out to both scopes. Manual handovers, read acknowledgements, and
locally sent messages use the same fanout after their database update. Events
are transient, so clients take a fresh snapshot once the subscription is ready
and after every relevant event. Redis is required for fan-out between separate
API and worker processes; memory mode only serves in-process development.

## Source layout

| File                                 | Responsibility                                            |
| ------------------------------------ | --------------------------------------------------------- |
| `src/app.ts`                         | Composes the Hono application and exports `AppType`       |
| `src/index.ts`                       | Starts the HTTP process and coordinates graceful shutdown |
| `src/worker.ts`                      | Starts the standalone subscriber process                  |
| `src/worker-config.ts`               | Parses worker-related environment variables               |
| `src/subscribers.ts`                 | Declares the topic-to-handler registry                    |
| `src/chat-realtime.ts`               | Defines chat PubSub channels and versioned event payloads |
| `src/mcp-server.ts`                  | Maps authorized runner functions to MCP tools             |
| `src/whatsapp-media.ts`              | Archives webhook media and returns message-to-file keys   |
| `src/routes/admin-organizations.ts`  | Application-admin organization operations                 |
| `src/routes/api-playground.ts`       | Organization-scoped WhatsApp API playground               |
| `src/routes/messaging-playground.ts` | Messaging playground and signed media upload URLs         |
| `src/routes/media-playground.ts`     | WhatsApp media upload, lookup, download, and deletion     |
| `src/routes/channels.ts`             | Organization-scoped channel administration                |
| `src/routes/events.ts`               | Validated demo event publisher                            |
| `src/routes/files.ts`                | Signed filesystem upload and download transport           |
| `src/routes/chats.ts`                | Chat reads, handoff, composer sends, media, and SSE       |
| `src/routes/contacts.ts`             | Organization-scoped contact listing and detail queries    |
| `src/routes/groups.ts`               | Organization-scoped group listing and detail queries      |
| `src/routes/mcp.ts`                  | Bearer-authenticated stateless MCP Streamable HTTP        |
| `src/routes/runner.ts`               | Versioned function lifecycle and isolated execution       |
| `src/routes/wa-cloud.ts`             | Verified WA Cloud webhook receiver and publisher          |
| `src/app.test.ts`                    | API contract and static-serving tests                     |
| `src/worker-config.test.ts`          | Worker configuration tests                                |

## Application construction

`createApp()` accepts optional `corsOrigin`, `eventBus`, `fileStore`,
`waCloudWebhook`, `apiPlayground`, `messagingPlayground`, `chats`, `contacts`,
`groups`, `mcp`, `runner`, `hasSsoProviders`, and `webRoot` values. This keeps route
tests independent from external infrastructure and allows production to supply
its static build directory.
The SSO availability dependency returns only a boolean and is injected in
tests so they never require PostgreSQL.

When `webRoot` is set, Hono:

1. Serves fingerprinted files below `/assets/*`.
2. Returns `index.html` for other non-API GET requests to support client-side routing.
3. Preserves JSON 404 responses below `/api`.

Keep route calls chained when editing `src/app.ts`; `AppType` is inferred from that chain and is the RPC contract exported to consumers.

## App process

The app process owns startup and graceful shutdown. `src/index.ts`:

1. Validates `PORT` and constructs the app.
2. Counts Better Auth users and creates the one-time generated `admin@meta.com` administrator when the database is empty.
3. Registers subscribers only when `ENABLE_WORKER_IN_PROCESS=true`.
4. Starts Hono with the Node server adapter.
5. Handles `SIGINT` and `SIGTERM` once.
6. Stops subscribers and closes the HTTP server, database, KV store, event bus,
   and file store.

The default port is `3000`. The default static root is `../web/dist`, relative to the API process working directory.

## Worker process

The worker runs subscribers only: it has no HTTP server and does not apply
migrations. `src/worker.ts` resolves the selected topics, registers their
handlers before starting the event bus, and waits for `SIGINT` or `SIGTERM`.
The Docker `worker` role runs this file.

`SUBSCRIBE_TO_TOPICS` defaults to `all`. Otherwise it accepts a comma-separated list such as:

```env
SUBSCRIBE_TO_TOPICS=demo.events.v1,another.topic.v1
```

Values are trimmed and deduplicated. Startup fails when a requested topic is absent from the registry, preventing a silently misconfigured worker.

When the main WhatsApp webhook topic is selected, its dead-letter topic is
included automatically. Retries are republished to the established main topic
with a durable retry-count header. `WA_WEBHOOK_MAX_RETRIES` accepts an integer
from `0` through `100` and defaults to `5`; `0` sends the first failure directly
to the dead-letter topic. Dead letters use this envelope:

```json
{
  "schemaVersion": 1,
  "failedAt": "2026-09-30T22:30:00.000Z",
  "retryCount": 5,
  "attempts": 6,
  "error": { "name": "ZodError", "message": "..." },
  "originalEvent": {
    "topic": "wa-cloud.webhook.v1",
    "key": "42",
    "headers": {},
    "timestamp": 1790807400000,
    "value": "{...original webhook bytes...}"
  }
}
```

Inspect the Kafka dead-letter queue with a separate consumer group so the
worker's offsets are unaffected:

```bash
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic wa-cloud.webhook.dead-letter.v1 \
  --from-beginning \
  --group mba-demo-webhook-dlq-inspector
```

## Adding an event handler

1. Define and export a stable topic name near its publisher.
2. Implement an `EventHandler`.
3. Add the handler under its topic in `subscriberRegistry` in `src/subscribers.ts`.
4. Add tests for handler behavior and topic selection.
5. Add the topic to `SUBSCRIBE_TO_TOPICS` for workers that should consume it, or keep `all`.

All subscriptions must be registered before `events.start()` because Kafka subscriptions cannot be added to a running adapter through this abstraction.

## Development commands

From the repository root:

```bash
yarn workspace @mba-demo/api dev
yarn workspace @mba-demo/api typecheck
yarn workspace @mba-demo/api test
yarn workspace @mba-demo/api build
```

`dev` loads the root `.env` when present and watches `src/index.ts`. A built app can be started with `yarn workspace @mba-demo/api start`.
