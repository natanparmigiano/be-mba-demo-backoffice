# MBA Demo Backoffice

A Yarn workspaces monorepo with a Node.js Hono API and a React frontend connected through Hono RPC. The backend includes Better Auth, Drizzle/PostgreSQL, Redis-compatible KV storage, and Kafka-compatible events.

This guide covers the backend, shared libraries, and deployment. Frontend implementation documentation is intentionally maintained separately.

## Run locally

```bash
corepack enable
yarn install
cp .env.dev .env
docker compose -f compose.dev.yaml up -d --wait
yarn db:migrate
yarn dev
```

This starts PostgreSQL, Redis, and Kafka in containers while the API and frontend run locally with watch mode. Open <http://localhost:5173>; it proxies `/api` requests to the Hono server at <http://localhost:3000>.

On the first API startup against an empty database, the application creates an `admin` user named `Admin` with email `admin@meta.com`. Its cryptographically generated password is printed once in the API logs. Sign in with those credentials and change the password immediately from the Administration screen. Later startups never print or replace credentials once any user exists.

Use `podman compose` instead of `docker compose` when working with Podman. Stop the development services without deleting their data with:

```bash
docker compose -f compose.dev.yaml down
```

The values in `.env.dev` are local-only credentials. See [`docker/README.md`](docker/README.md#development-infrastructure) for service ports, health checks, and data-reset commands.

## Requirements

- Node.js 20.19 or newer
- Corepack (included with most Node.js installations)
- Yarn 1.22.22, selected by the root `packageManager` field
- Docker or Podman with a Compose provider

## Docker

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the complete deployment-mode comparison and step-by-step guides for local development, Simple Compose, Full Compose, Render, and generic container platforms.

For local application development, start only the supporting services:

```bash
docker compose -f compose.dev.yaml up -d --wait
```

The application image has `app` and `worker` roles. Its Hono server hosts both the API and the built React application. The full stack runs subscribers in the separate worker process:

```bash
docker compose up --build
```

For the smallest stack, using the in-memory KV and event adapters with subscribers embedded in the app process:

```bash
docker compose -f compose.simple.yaml up --build
```

Open <http://localhost:8080>. Hono serves the React build with SPA fallback alongside `/api`. The `app` role applies pending Drizzle migrations before it starts accepting traffic. Full Compose uses Redis for Better Auth secondary storage; simple Compose uses process-local memory. Override the host port with `WEB_PORT`, for example `WEB_PORT=8081 docker compose up`.

The Compose defaults, including its auth secret, are intended only for local development. Set `BETTER_AUTH_SECRET`, `COMPOSE_BETTER_AUTH_URL`, and `COMPOSE_CORS_ORIGIN` to deployment-specific values outside local development.

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
yarn auth:generate # regenerate Better Auth's Drizzle schema
yarn auth:create-admin --email admin@example.com --name "Admin" --role admin
```

The database defaults to `postgresql://postgres:postgres@localhost:5432/mba_demo_backoffice` in development. In production, `NODE_ENV=production` requires an explicit `DATABASE_URL`. Set `PORT` to change the API port and `CORS_ORIGIN` to allow a different frontend origin.

## Configuration

| Variable                   | Required       | Purpose                                                     |
| -------------------------- | -------------- | ----------------------------------------------------------- |
| `DATABASE_URL`             | Production     | PostgreSQL connection URL                                   |
| `BETTER_AUTH_SECRET`       | Production     | Better Auth signing secret                                  |
| `BETTER_AUTH_URL`          | Production     | Public Better Auth base URL                                 |
| `CORS_ORIGIN`              | No             | Trusted browser origin; defaults to `http://localhost:5173` |
| `PORT`                     | No             | Hono port; defaults to `3000`                               |
| `WEB_ROOT`                 | No             | Static build directory; defaults to `../web/dist`           |
| `REDIS_URL`                | No             | Selects Redis; otherwise KV uses memory                     |
| `KAFKA_CLIENT_ID`          | With brokers   | Selects Kafka together with `KAFKA_BROKERS`                 |
| `KAFKA_BROKERS`            | With client ID | Comma-separated Kafka brokers                               |
| `KAFKA_GROUP_ID`           | No             | Consumer group; defaults from the client ID                 |
| `ENABLE_WORKER_IN_PROCESS` | No             | Enables app-process subscribers only when `true`            |
| `SUBSCRIBE_TO_TOPICS`      | No             | CSV of registered topics or `all`; defaults to `all`        |
| `WEB_PORT`                 | Compose only   | Host port mapped to port 8080                               |
| `COMPOSE_BETTER_AUTH_URL`  | Compose only   | Public auth URL injected into the app                       |
| `COMPOSE_CORS_ORIGIN`      | Compose only   | Browser origin injected into the app                        |

See `.env.example` for local values. The development auth secret and Compose credentials are not suitable for production.

## Structure

```text
apps/
  api/  Node.js Hono server, worker, and exported AppType
  web/  Frontend workspace; documented separately
  webhook-generator/ Stateful WhatsApp Cloud API and MBA webhook load CLI
lib/
  db/   Drizzle client, PostgreSQL schema, and migration configuration
  auth/ Better Auth server configuration and inferred auth types
  events/ Kafka event bus with an in-process EventEmitter fallback
  kv/   Redis-compatible key/value client with an in-memory fallback
  schemas/ Shared schemas, including WhatsApp Cloud API webhooks
```

Keep route definitions chained in `apps/api/src/app.ts` so Hono can infer the complete RPC contract. The frontend imports `AppType` with `import type`, so server runtime code is never included in the browser bundle.

Import `db` and schema types from `@mba-demo/db`. The Postgres.js client opens connections lazily; call `closeDatabase()` during graceful application shutdown when the API starts using the database.

Database definitions are grouped by PostgreSQL schema under `lib/db/src/schema`. The generated `auth.ts` contains Better Auth tables in the PostgreSQL `auth` schema, while `mba.ts` contains application-owned tables in the PostgreSQL `mba` schema. Re-export future schema files from `schema/index.ts` so Drizzle receives the complete registry.

The Better Auth handler is mounted at `/api/auth/**`. Email/password, SSO, application administration, and organizations are enabled. Empty databases receive a one-time generated `admin@meta.com` administrator during API startup; `yarn auth:create-admin` remains available for explicitly creating another administrator. User and role administration is available at `/admin`, while organization and membership management is available at `/organization`. Development defaults are provided for local use; production requires both `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.

Import `kv` from `@mba-demo/kv`. It uses Redis when `REDIS_URL` is configured and otherwise falls back to process-local memory, making local development dependency-free. The common API covers string reads/writes, conditional writes, multi-key operations, counters, expiration, persistence, TTL inspection, health checks, and graceful shutdown.

Import `events` from `@mba-demo/events`. It uses Kafka only when both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS` are configured; otherwise it uses an in-process event bus. Publish a demo event with `POST /api/events` and a JSON body such as `{ "message": "hello" }`; the registered subscriber writes it to stdout.

Subscriber handlers are kept in a registry. `SUBSCRIBE_TO_TOPICS` accepts a comma-separated topic list and defaults to `all`; unknown topics fail at startup. Set `ENABLE_WORKER_IN_PROCESS=true` to embed subscribers in the app. The full Compose stack instead runs the dedicated `worker` command.

## Render deployment

[`render.yaml`](render.yaml) defines a free-tier Docker web service, a free Render PostgreSQL database, and a free Render Key Value service. Subscribers run in the app process, events use the memory adapter, and KV uses the managed Redis-compatible service. Render generates the auth secret and injects the internal database and Redis connection strings.

When applying the Blueprint, provide the final public service URL for both `BETTER_AUTH_URL` and `CORS_ORIGIN`. See [`docker/README.md`](docker/README.md#render-blueprint) for deployment details and free-tier constraints.

## Detailed documentation

- [`DEPLOYMENT.md`](DEPLOYMENT.md): all deployment modes, feature comparison, configuration, operations, and troubleshooting
- [`apps/README.md`](apps/README.md): application workspace boundaries
- [`apps/api/README.md`](apps/api/README.md): routes, lifecycle, static serving, and workers
- [`apps/webhook-generator/README.md`](apps/webhook-generator/README.md): synthetic webhook pools, sequencing, and CLI usage
- [`lib/README.md`](lib/README.md): shared-library conventions
- [`lib/auth/README.md`](lib/auth/README.md): Better Auth and schema generation
- [`lib/db/README.md`](lib/db/README.md): PostgreSQL schemas and migrations
- [`lib/events/README.md`](lib/events/README.md): Kafka and in-memory event adapters
- [`lib/kv/README.md`](lib/kv/README.md): Redis and in-memory KV adapters
- [`lib/schemas/README.md`](lib/schemas/README.md): shared application schemas
- [`docker/README.md`](docker/README.md): image roles and Compose profiles
