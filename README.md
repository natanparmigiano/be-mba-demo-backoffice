# MBA Demo Backoffice

MBA Demo Backoffice provides an organization-scoped React application and a
typed Hono API for administering WhatsApp channels, contacts, groups, chats,
users, and SSO. The Yarn workspaces monorepo uses Better Auth,
Drizzle/PostgreSQL, Redis-compatible KV storage and Pub/Sub, Kafka-compatible
events, and filesystem/S3-compatible object storage; Hono RPC keeps the browser
and server contract aligned.

Start here for local setup and the system-wide contracts. Follow the linked
workspace guides for implementation detail and [`DEPLOYMENT.md`](DEPLOYMENT.md)
before choosing a hosted topology.

## Run locally

```bash
corepack enable
yarn install
cp .env.dev .env
docker compose -f compose.dev.yaml up -d --wait
yarn db:migrate
yarn dev
```

Open <http://localhost:5173> after the commands complete. PostgreSQL, Redis,
Kafka, and MinIO run in containers; the API and frontend run locally in watch
mode, and Vite proxies `/api` to Hono at <http://localhost:3000>.

For the first sign-in, use the `admin@meta.com` credentials printed once in the
API logs and immediately change the generated password on the Administration
screen. The application creates this `Admin` account only when the database has
no users; later startups neither replace the account nor print credentials.

Use `podman compose` instead of `docker compose` when working with Podman. Stop the development services without deleting their data with:

```bash
docker compose -f compose.dev.yaml down
```

The values in `.env.dev` are local-only credentials. See [`docker/README.md`](docker/README.md#development-infrastructure) for service ports, health checks, and data-reset commands.

## Requirements

- Node.js 24 or newer (required by the isolated JavaScript runner)
- Corepack (included with most Node.js installations)
- Yarn 1.22.22, selected by the root `packageManager` field
- Docker or Podman with a Compose provider

## Choose a deployment mode

Use host development for normal editing, Simple Compose for the smallest
self-contained demo, and Full Compose when you need to exercise a separate
Kafka worker. [`DEPLOYMENT.md`](DEPLOYMENT.md) compares every mode and covers
Render and generic container platforms.

Start only the supporting services for local development:

```bash
docker compose -f compose.dev.yaml up -d --wait
```

Run the full stack to test the image's separate `app` and `worker` roles:

```bash
docker compose up --build
```

Run the smallest stack with process-local KV and events:

```bash
docker compose -f compose.simple.yaml up --build
```

Open <http://localhost:8080>. In both profiles, Hono serves the React build and
`/api`, and the `app` role applies pending migrations before accepting traffic.
Full Compose uses Redis and Kafka across separate processes; Simple Compose
keeps KV, events, and subscribers in one process. Override the host port with
`WEB_PORT`, for example `WEB_PORT=8081 docker compose up`.

Do not expose the committed Compose defaults publicly. Outside local
development, set a high-entropy `BETTER_AUTH_SECRET` and deployment-correct
`COMPOSE_BETTER_AUTH_URL` and `COMPOSE_CORS_ORIGIN` values.

## Commands

```bash
yarn dev        # run the API and frontend together
yarn format     # format the repository with Prettier
yarn lint       # lint the repository with ESLint
yarn typecheck  # type-check every workspace
yarn test       # run backend library and API tests
yarn build      # create production builds
yarn quality    # run formatting, lint, type-check, and test gates
yarn db:generate # generate a migration after schema changes
yarn db:migrate  # apply pending migrations
yarn db:studio   # inspect the database with Drizzle Studio
yarn smoke:runner # smoke-test runner routes, storage, keys, and isolation
yarn auth:generate # regenerate Better Auth's Drizzle schema
yarn auth:create-admin --email admin@example.com --name "Admin" --role admin
yarn sso help     # inspect SSO provider setup and lifecycle commands
yarn webhook:bridge -- --database-url <url> --channel-id <id>
```

The database defaults to `postgresql://postgres:postgres@localhost:5432/mba_demo_backoffice` in development. In production, `NODE_ENV=production` requires an explicit `DATABASE_URL`. Set `PORT` to change the API port and `CORS_ORIGIN` to allow a different frontend origin.

## Configuration

| Variable                      | Required       | Purpose                                                     |
| ----------------------------- | -------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                | Production     | PostgreSQL connection URL                                   |
| `BETTER_AUTH_SECRET`          | Production     | Better Auth signing secret                                  |
| `BETTER_AUTH_URL`             | Production     | Public Better Auth base URL                                 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | With OIDC      | Comma-separated exact IdP endpoint origins                  |
| `CORS_ORIGIN`                 | No             | Trusted browser origin; defaults to `http://localhost:5173` |
| `MCP_ALLOWED_HOSTS`           | Production     | Comma-separated public hostnames accepted by MCP routes     |
| `PORT`                        | No             | Hono port; defaults to `3000`                               |
| `WEB_ROOT`                    | No             | Static build directory; defaults to `../web/dist`           |
| `REDIS_URL`                   | No             | Selects Redis for KV and Pub/Sub; otherwise both use memory |
| `KAFKA_CLIENT_ID`             | With brokers   | Selects Kafka together with `KAFKA_BROKERS`                 |
| `KAFKA_BROKERS`               | With client ID | Comma-separated Kafka brokers                               |
| `KAFKA_GROUP_ID`              | No             | Consumer group; defaults from the client ID                 |
| `ENABLE_WORKER_IN_PROCESS`    | No             | Enables app-process subscribers only when `true`            |
| `SUBSCRIBE_TO_TOPICS`         | No             | CSV of registered topics or `all`; defaults to `all`        |
| `FILES_ADAPTER`               | No             | `fs` (default) or `s3`                                      |
| `FILES_DIRECTORY`             | FS             | Persistent filesystem storage root                          |
| `FILES_PUBLIC_URL`            | FS production  | Public Hono base URL used for filesystem signed URLs        |
| `FILES_SIGNING_SECRET`        | FS production  | HMAC secret for filesystem signed URLs                      |
| `FILES_S3_BUCKET`             | S3             | S3 or S3-compatible bucket                                  |
| `FILES_S3_ENDPOINT`           | S3-compatible  | Internal object API endpoint                                |
| `FILES_S3_PUBLIC_ENDPOINT`    | S3-compatible  | Client-reachable endpoint used for presigned URLs           |
| `WEB_PORT`                    | Compose only   | Host port mapped to port 8080                               |
| `COMPOSE_BETTER_AUTH_URL`     | Compose only   | Public auth URL injected into the app                       |
| `COMPOSE_CORS_ORIGIN`         | Compose only   | Browser origin injected into the app                        |

See `.env.example` for local values. The development auth secret and Compose credentials are not suitable for production.

## Architecture and workspace boundaries

```text
apps/
  api/  Node.js Hono server, worker, and exported AppType
  web/  Frontend workspace; documented separately
  sso-cli/ Administrative CLI for OIDC/SAML provider setup
  webhook-bridge/ PostgreSQL-to-Kafka webhook testing bridge
  webhook-generator/ Stateful WhatsApp Cloud API and MBA webhook load CLI
lib/
  db/   Drizzle client, PostgreSQL schema, and migration configuration
  auth/ Better Auth server configuration and inferred auth types
  events/ Kafka event bus with an in-process EventEmitter fallback
  files/ Filesystem and S3-compatible object storage adapters
  runner/ Organization-scoped versioned JavaScript function runner
  kv/   Redis-compatible key/value client with an in-memory fallback
  pubsub/ Redis Pub/Sub with an in-process EventEmitter fallback
  whatsapp/analytics/ Typed WhatsApp WABA analytics client
  whatsapp/flows/ Typed WhatsApp Flow-management client
  whatsapp/media/ Typed WhatsApp Cloud API media client
  whatsapp/mba/ Typed Meta Business Agent Platform API client
  whatsapp/messaging/ Typed WhatsApp Cloud API message-sending client
  whatsapp/moderation/ Typed WhatsApp user blocklist client
  whatsapp/registration/ Typed phone-number registration client
  whatsapp/subscriptions/ Typed WABA webhook-subscription client
  whatsapp/templates/ Typed WhatsApp template-management client
  whatsapp/waba/ Typed WhatsApp Business Account discovery client
  whatsapp/webhooks/ WhatsApp webhook schemas and inferred types
```

The central type-sharing contract is the chained route definition in
`apps/api/src/app.ts`. Hono infers the complete `AppType`; the frontend imports
that type with `import type`, so server runtime code never enters the browser
bundle.

Import database APIs through `@mba-demo/db`. Postgres.js connects lazily, and
the application must call `closeDatabase()` during graceful shutdown.

Database definitions are grouped by PostgreSQL schema under `lib/db/src/schema`. The generated `auth.ts` contains Better Auth tables in the PostgreSQL `auth` schema, while `mba.ts` contains application-owned tables in the PostgreSQL `mba` schema. Re-export future schema files from `schema/index.ts` so Drizzle receives the complete registry.

Authentication is mounted at `/api/auth/*` and supports email/password, SSO,
application administration, and organizations. Manage global users and roles
at `/admin`; manage organization membership at `/organization`. Production
requires both `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. See
[`SSO.md`](SSO.md) before registering an OIDC or SAML provider.

Import `kv` from `@mba-demo/kv`. It uses Redis when `REDIS_URL` is configured and otherwise falls back to process-local memory, making local development dependency-free. The common API covers string reads/writes, conditional writes, multi-key operations, counters, expiration, persistence, TTL inspection, health checks, and graceful shutdown.

Import `pubsub` from `@mba-demo/pubsub` for transient fan-out messages. It uses
Redis Pub/Sub when `REDIS_URL` is configured and an in-process `EventEmitter`
otherwise. Pub/Sub messages are not durable or replayable; use
`@mba-demo/events` when delivery requires Kafka persistence or consumer groups.

Import `events` from `@mba-demo/events`. It uses Kafka only when both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS` are configured; otherwise it uses an in-process event bus. Publish a demo event with `POST /api/events` and a JSON body such as `{ "message": "hello" }`; the registered subscriber writes it to stdout.

Import `files` from `@mba-demo/files`. Both adapters expose `get`, `put`,
`delete`, and signed upload/download URLs. Filesystem mode stores durable bytes
below `FILES_DIRECTORY` and serves HMAC-authorized URLs through Hono. S3 mode
uses native SigV4 URLs and supports separate internal and public endpoints for
MinIO.

Import WABA analytics from `@mba-demo/wa-analytics`. It covers messaging,
conversation, pricing, template, template-group, call, and group analytics,
plus the explicit operation for enabling template insights.

Import Meta Business Agent operations from `@mba-demo/wa-mba`. It covers the
complete MBA lifecycle and configuration surface, knowledge sources,
instructions, connectors and tools, tests and events, evaluations, thread
control, and insights. The stateless client uses injected `fetch` in tests and
does not retry rate-limited requests automatically.

Import Flow management from `@mba-demo/wa-flows`. It covers Flow creation,
metadata and JSON assets, previews, publishing and deprecation, migration,
endpoint metrics, and endpoint encryption keys. Flow message delivery remains
in `@mba-demo/wa-messaging`.

Import the message-sending client from `@mba-demo/wa-messaging`. Its typed
message union and convenience methods cover WhatsApp Cloud API text, media,
contacts, locations, reactions, interactive payloads, and templates. The
package owns only the `/{phone-number-id}/messages` operation and performs no
I/O until a send method is called.

Import media operations from `@mba-demo/wa-media`. It provides typed upload,
temporary URL retrieval, authenticated download, and delete operations for the
WhatsApp Cloud API media lifecycle. The webhook subscriber combines it with
`@mba-demo/files` to verify and archive inbound media under deterministic,
UUID-sharded keys, which are retained on the corresponding message row.

Import user blocklist operations from `@mba-demo/wa-moderation`. It lists,
blocks, and unblocks WhatsApp users for a configured business phone number and
preserves partial per-user failures from bulk operations.

Import the phone-number lifecycle client from `@mba-demo/wa-registration`. It
handles ownership verification codes, registration with two-step verification
and optional data localization, registration status lookup, PIN changes, and
deregistration.

Import template management from `@mba-demo/wa-templates`. It covers template
creation, retrieval, filtering, editing, bulk deletion and authentication
upserts, migration, the Template Library, and template groups.

Import WABA subscription operations from `@mba-demo/wa-subscriptions`. It
subscribes and unsubscribes the application, lists current subscriptions, and
sets WABA-specific callback overrides. The channel-management API uses this
client when configuring Meta's callback URL.

Import WABA discovery from `@mba-demo/wa-waba`. It retrieves a WhatsApp
Business Account by ID and lists the WABAs a Meta business owns or can access
through sharing, including Graph API cursor pagination.

Import webhook schemas and inferred payload types from
`@mba-demo/wa-webhooks`. The package preserves additive Graph API fields while
using discriminated unions for stable webhook tags.

Subscriber handlers are kept in a registry. `SUBSCRIBE_TO_TOPICS` accepts a comma-separated topic list and defaults to `all`; unknown topics fail at startup. Set `ENABLE_WORKER_IN_PROCESS=true` to embed subscribers in the app. The full Compose stack instead runs the dedicated `worker` command.

## Render deployment

[`render.yaml`](render.yaml) defines a starter Docker web service with a
persistent disk, plus a free Render PostgreSQL database and Key Value service.
Subscribers run in the app process, events use the memory adapter, KV uses the
managed Redis-compatible service, and files use the mounted filesystem.

When applying the Blueprint, provide the final public service URL for
`BETTER_AUTH_URL`, `CORS_ORIGIN`, and `FILES_PUBLIC_URL`. See
[`docker/README.md`](docker/README.md#render-blueprint) for deployment details.

## Detailed documentation

- [`DEPLOYMENT.md`](DEPLOYMENT.md): all deployment modes, feature comparison, configuration, operations, and troubleshooting
- [`SSO.md`](SSO.md): OIDC and SAML provider registration, domain verification, and troubleshooting
- [`apps/README.md`](apps/README.md): application workspace boundaries
- [`apps/api/README.md`](apps/api/README.md): routes, lifecycle, static serving, and workers
- [`apps/sso-cli/README.md`](apps/sso-cli/README.md): SSO administration CLI usage
- [`apps/webhook-bridge/README.md`](apps/webhook-bridge/README.md): PostgreSQL webhook testing bridge usage
- [`apps/webhook-generator/README.md`](apps/webhook-generator/README.md): synthetic webhook pools, sequencing, and CLI usage
- [`lib/README.md`](lib/README.md): shared-library conventions
- [`lib/auth/README.md`](lib/auth/README.md): Better Auth and schema generation
- [`lib/db/README.md`](lib/db/README.md): PostgreSQL schemas and migrations
- [`lib/events/README.md`](lib/events/README.md): Kafka and in-memory event adapters
- [`lib/files/README.md`](lib/files/README.md): filesystem and S3-compatible file storage
- [`lib/kv/README.md`](lib/kv/README.md): Redis and in-memory KV adapters
- [`lib/pubsub/README.md`](lib/pubsub/README.md): Redis and in-memory Pub/Sub adapters
- [`lib/whatsapp/analytics/README.md`](lib/whatsapp/analytics/README.md): typed WhatsApp WABA analytics
- [`lib/whatsapp/flows/README.md`](lib/whatsapp/flows/README.md): typed WhatsApp Flow management
- [`lib/whatsapp/media/README.md`](lib/whatsapp/media/README.md): typed WhatsApp media operations
- [`lib/whatsapp/messaging/README.md`](lib/whatsapp/messaging/README.md): typed WhatsApp message sending
- [`lib/whatsapp/moderation/README.md`](lib/whatsapp/moderation/README.md): typed WhatsApp user blocklist operations
- [`lib/whatsapp/registration/README.md`](lib/whatsapp/registration/README.md): phone-number verification and registration
- [`lib/whatsapp/subscriptions/README.md`](lib/whatsapp/subscriptions/README.md): typed WABA webhook subscriptions
- [`lib/whatsapp/templates/README.md`](lib/whatsapp/templates/README.md): typed WhatsApp template management
- [`lib/whatsapp/waba/README.md`](lib/whatsapp/waba/README.md): typed WhatsApp Business Account discovery
- [`lib/whatsapp/webhooks/README.md`](lib/whatsapp/webhooks/README.md): typed WhatsApp webhook schemas
- [`docker/README.md`](docker/README.md): image roles and Compose profiles
