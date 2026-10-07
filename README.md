# MBA Desk

MBA Desk provides an organization-scoped React application and a
typed Hono API for administering WhatsApp channels, contacts, groups, teams,
chats, users, and SSO. The Yarn workspaces monorepo uses Better Auth,
Drizzle/PostgreSQL, Redis-compatible KV storage and Pub/Sub, Kafka-compatible
events, and filesystem/PostgreSQL/S3-compatible object storage; Hono RPC keeps the browser
and server contract aligned.

Start here for local setup and the system-wide contracts. Follow the linked
workspace guides for implementation detail and the [deployment guide](docs/deployment/)
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
Kafka worker. The [deployment guide](docs/deployment/) compares every mode and covers
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
explicitly selects memory KV and keeps events and subscribers in one process.
Override the host port with `WEB_PORT`, for example
`WEB_PORT=8081 docker compose up`.

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
```

The database defaults to `postgresql://postgres:postgres@localhost:5432/mba_desk` in development. In production, `NODE_ENV=production` requires an explicit `DATABASE_URL`. Set `PORT` to change the API port and `CORS_ORIGIN` to allow a different frontend origin.

## Configuration

| Variable                      | Required               | Purpose                                                     |
| ----------------------------- | ---------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                | Production             | PostgreSQL connection URL                                   |
| `BETTER_AUTH_SECRET`          | Production             | Better Auth signing secret                                  |
| `BETTER_AUTH_URL`             | Production             | Public Better Auth base URL                                 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | With OIDC              | Comma-separated exact IdP endpoint origins                  |
| `CORS_ORIGIN`                 | No                     | Trusted browser origin; defaults to `http://localhost:5173` |
| `PORT`                        | No                     | Hono port; defaults to `3000`                               |
| `WEB_ROOT`                    | No                     | Static build directory; defaults to `../web/dist`           |
| `KV_ADAPTER`                  | No                     | `memory`, `postgres` (default), or `redis`                  |
| `REDIS_URL`                   | Redis KV / No          | Selects Redis KV when inferred; also enables Redis Pub/Sub  |
| `KAFKA_CLIENT_ID`             | With brokers           | Selects Kafka together with `KAFKA_BROKERS`                 |
| `KAFKA_BROKERS`               | With client ID         | Comma-separated Kafka brokers                               |
| `KAFKA_GROUP_ID`              | No                     | Consumer group; defaults from the client ID                 |
| `ENABLE_WORKER_IN_PROCESS`    | No                     | Enables app-process subscribers only when `true`            |
| `SUBSCRIBE_TO_TOPICS`         | No                     | CSV of registered topics or `all`; defaults to `all`        |
| `FILES_ADAPTER`               | No                     | `fs` (default), test/demo-only `postgres`, or `s3`          |
| `FILES_DIRECTORY`             | FS                     | Persistent filesystem storage root                          |
| `FILES_PUBLIC_URL`            | FS/Postgres production | Public Hono base URL used for signed URLs                   |
| `FILES_SIGNING_SECRET`        | FS/Postgres production | HMAC secret for signed URLs                                 |
| `FILES_S3_BUCKET`             | S3                     | S3 or S3-compatible bucket                                  |
| `FILES_S3_ENDPOINT`           | S3-compatible          | Internal object API endpoint                                |
| `FILES_S3_PUBLIC_ENDPOINT`    | S3-compatible          | Client-reachable endpoint used for presigned URLs           |
| `WEB_PORT`                    | Compose only           | Host port mapped to port 8080                               |
| `COMPOSE_BETTER_AUTH_URL`     | Compose only           | Public auth URL injected into the app                       |
| `COMPOSE_CORS_ORIGIN`         | Compose only           | Browser origin injected into the app                        |

See `.env.example` for local values. The development auth secret and Compose credentials are not suitable for production.

## Architecture and workspace boundaries

The browser talks to one Hono API. The API owns authentication, process
lifecycle, persistence, external integrations, and the shared RPC contract.
Reusable capabilities live in `lib/*`; applications may import libraries, but
libraries must never import applications.

```mermaid
flowchart LR
  browser[React browser app] -->|typed Hono RPC| api[Hono API]
  api --> auth[Better Auth]
  api --> db[(PostgreSQL)]
  api --> kv[(KV / Redis)]
  api --> files[(File storage)]
  api --> meta[WhatsApp and MBA APIs]
  api --> events{Event bus}
  events --> worker[Subscriber workers]

  classDef app fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef data fill:#dcfce7,stroke:#16a34a,color:#052e16
  classDef external fill:#fef3c7,stroke:#d97706,color:#451a03
  class browser,api,worker app
  class db,kv,files data
  class meta external
```

### What lives where?

| Area                     | Responsibility                                                            |
| ------------------------ | ------------------------------------------------------------------------- |
| `apps/api`               | Hono routes, lifecycle, workers, SPA delivery, and exported `AppType`     |
| `apps/web`               | React/Vite browser application                                            |
| `apps/sso-cli`           | OIDC and SAML provider administration                                     |
| `apps/webhook-generator` | Stateful WhatsApp and MBA webhook load generation                         |
| `lib/*`                  | Shared persistence, auth, messaging, storage, events, and runner packages |

### Which contracts matter most?

1. **RPC types flow from the API to the browser.** The chained routes in
   `apps/api/src/app.ts` produce `AppType`. The frontend imports it with
   `import type`, so API runtime code stays out of the browser bundle.
2. **External connections are lazy.** Shared packages do not connect during
   import. The API starts and closes resources explicitly during its lifecycle.
3. **Workspace imports use package names.** Import through `@mba-desk/*`, never
   through another workspace's source directory.
4. **Durability is intentional.** Use Pub/Sub for transient notification and
   the event bus for durable, replayable work.

## Runtime flows

### How does a browser request move through the system?

```mermaid
sequenceDiagram
  actor User
  participant Web as React app
  participant API as Hono API
  participant Auth as Better Auth
  participant DB as PostgreSQL

  User->>Web: Perform an action
  Web->>API: Typed RPC request
  API->>Auth: Resolve session and organization
  Auth-->>API: Identity and access
  API->>DB: Read or mutate scoped data
  DB-->>API: Result
  API-->>Web: Typed JSON response
  Web-->>User: Updated UI
```

Authentication is mounted at `/api/auth/*` and supports email/password, SSO,
application administration, and organizations. Manage global users and roles
at `/admin`; manage organization membership at `/organization`. Production
requires `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. Read the [SSO guide](docs/sso/)
before registering an identity provider.

### How does webhook work reach subscribers?

```mermaid
flowchart LR
  meta[WhatsApp webhook] --> api[Hono webhook route]
  api -->|verify and publish| bus{Event adapter}
  bus -->|development / simple mode| local[In-process subscribers]
  bus -->|full deployment| kafka[(Kafka)]
  kafka --> worker[Dedicated worker]
  local --> persistence[(Database and files)]
  worker --> persistence
```

Subscriber handlers live in a registry. `SUBSCRIBE_TO_TOPICS` accepts a
comma-separated list and defaults to `all`; an unknown topic fails startup.
Set `ENABLE_WORKER_IN_PROCESS=true` to embed subscribers in the API. Full
Compose runs the dedicated `worker` role instead.

## Choosing shared infrastructure

### Should I use KV, Pub/Sub, or events?

| Need                               | Package            | Local adapter  | Distributed adapter |
| ---------------------------------- | ------------------ | -------------- | ------------------- |
| Store values, counters, or TTLs    | `@mba-desk/kv`     | Memory         | Redis               |
| Broadcast transient updates        | `@mba-desk/pubsub` | EventEmitter   | Redis Pub/Sub       |
| Process durable or replayable work | `@mba-desk/events` | In-process bus | Kafka               |

Use Pub/Sub when missing an event during a restart is acceptable. Use the event
bus when work must survive process boundaries or use consumer groups. Kafka is
selected only when both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS` are configured.

### Where should files be stored?

All `@mba-desk/files` adapters expose `get`, `put`, `delete`, and signed upload
and download URLs.

| Adapter       | Best fit                                           | Important behavior                                                          |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Filesystem    | Local development or a host with a persistent disk | Stores bytes below `FILES_DIRECTORY`; Hono serves HMAC-signed URLs          |
| S3-compatible | Production                                         | Uses native SigV4 URLs and supports separate internal and public endpoints  |
| PostgreSQL    | Short-lived tests and demos                        | Stores blobs in `files.__files`; not recommended for general production use |

### How is the database organized?

Import database APIs through `@mba-desk/db`. Postgres.js connects lazily, and
the API calls `closeDatabase()` during graceful shutdown. Schema definitions
live under `lib/db/src/schema`:

- `auth.ts` contains generated Better Auth tables in the `auth` schema.
- `mba.ts` contains application-owned tables in the `mba` schema.
- `schema/index.ts` must re-export every schema file so Drizzle sees the full
  registry.

## WhatsApp and MBA package map

Choose the narrowest client for the operation. These clients are stateless and
perform no I/O until called.

| Package                      | Use it for                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `@mba-desk/wa-analytics`     | Messaging, conversation, pricing, template, call, and group analytics                    |
| `@mba-desk/wa-components`    | Conversational commands and icebreaker configuration                                     |
| `@mba-desk/wa-flows`         | Flow creation, assets, previews, publishing, migration, metrics, and encryption keys     |
| `@mba-desk/wa-media`         | Media upload, temporary URLs, authenticated download, and deletion                       |
| `@mba-desk/wa-mba`           | Agent lifecycle, instructions, knowledge, connectors, evaluations, control, and insights |
| `@mba-desk/wa-messaging`     | Text, media, contacts, locations, reactions, interactive messages, and templates         |
| `@mba-desk/wa-moderation`    | Listing, blocking, and unblocking WhatsApp users                                         |
| `@mba-desk/wa-qr`            | Click-to-chat QR code lifecycle and provider-managed images                              |
| `@mba-desk/wa-registration`  | Ownership verification, registration, PINs, localization, and deregistration             |
| `@mba-desk/wa-subscriptions` | App subscriptions and WABA callback overrides                                            |
| `@mba-desk/wa-templates`     | Template CRUD, migration, library, authentication upserts, and groups                    |
| `@mba-desk/wa-waba`          | WABA lookup and owned/shared account discovery                                           |
| `@mba-desk/wa-webhooks`      | Webhook schemas, additive fields, and discriminated payload types                        |

### Common integration questions

#### Where does Flow message delivery belong?

In `@mba-desk/wa-messaging`; `@mba-desk/wa-flows` manages Flow definitions and
assets.

#### How is inbound media archived?

The webhook subscriber combines `@mba-desk/wa-media` with `@mba-desk/files`,
stores bytes under deterministic UUID-sharded keys, and retains the key on the
message row.

#### Do clients retry rate limits automatically?

No. In particular, the MBA client exposes provider failures to its caller so
retry policy remains explicit at the application boundary.

#### Which package owns the messages endpoint?

`@mba-desk/wa-messaging` owns `/{phone-number-id}/messages`.

## Render deployment

[`render.yaml`](render.yaml) defines a starter Docker web service with a
persistent disk, plus a free Render PostgreSQL database and Key Value service.
Subscribers run in the app process, events use the memory adapter, KV uses the
managed Redis-compatible service, and files use the mounted filesystem.

When applying the Blueprint, provide the final public service URL for
`BETTER_AUTH_URL`, `CORS_ORIGIN`, and `FILES_PUBLIC_URL`. See
[`docker/README.md`](docker/README.md#render-blueprint) for deployment details.

## Documentation map

Start with the document closest to the change you are making.

### Deploy and operate

- [Deployment](docs/deployment/) — deployment modes, configuration, operations, and troubleshooting
- [`docker/README.md`](docker/README.md) — image roles and Compose profiles
- [SSO](docs/sso/) — OIDC/SAML registration and domain verification

### Change an application

- [`apps/README.md`](apps/README.md) — application boundaries
- [`apps/api/README.md`](apps/api/README.md) — routes, lifecycle, SPA serving, and workers
- [`apps/web/README.md`](apps/web/README.md) — frontend architecture and conventions
- [`apps/sso-cli/README.md`](apps/sso-cli/README.md) — SSO administration CLI
- [`apps/webhook-generator/README.md`](apps/webhook-generator/README.md) — synthetic webhook generation

### Change shared infrastructure

- [`lib/README.md`](lib/README.md) — shared-library conventions
- [`lib/auth/README.md`](lib/auth/README.md) — Better Auth and schema generation
- [`lib/db/README.md`](lib/db/README.md) — schemas and migrations
- [`lib/events/README.md`](lib/events/README.md) — Kafka and in-process events
- [`lib/files/README.md`](lib/files/README.md) — filesystem, PostgreSQL, and S3-compatible storage
- [`lib/kv/README.md`](lib/kv/README.md) — Redis and memory KV
- [`lib/pubsub/README.md`](lib/pubsub/README.md) — Redis and memory Pub/Sub

### Change a WhatsApp integration

- [`lib/whatsapp/README.md`](lib/whatsapp/README.md) — package boundaries and shared conventions
- [`lib/whatsapp/analytics/README.md`](lib/whatsapp/analytics/README.md) — WABA analytics
- [`lib/whatsapp/components/README.md`](lib/whatsapp/components/README.md) — conversational components
- [`lib/whatsapp/flows/README.md`](lib/whatsapp/flows/README.md) — Flow management
- [`lib/whatsapp/mba/README.md`](lib/whatsapp/mba/README.md) — Meta Business Agent operations
- [`lib/whatsapp/media/README.md`](lib/whatsapp/media/README.md) — media lifecycle
- [`lib/whatsapp/messaging/README.md`](lib/whatsapp/messaging/README.md) — message delivery
- [`lib/whatsapp/moderation/README.md`](lib/whatsapp/moderation/README.md) — user blocklist
- [`lib/whatsapp/qr/README.md`](lib/whatsapp/qr/README.md) — click-to-chat QR codes
- [`lib/whatsapp/registration/README.md`](lib/whatsapp/registration/README.md) — phone registration
- [`lib/whatsapp/subscriptions/README.md`](lib/whatsapp/subscriptions/README.md) — webhook subscriptions
- [`lib/whatsapp/templates/README.md`](lib/whatsapp/templates/README.md) — message templates
- [`lib/whatsapp/waba/README.md`](lib/whatsapp/waba/README.md) — WABA discovery
- [`lib/whatsapp/webhooks/README.md`](lib/whatsapp/webhooks/README.md) — webhook schemas
