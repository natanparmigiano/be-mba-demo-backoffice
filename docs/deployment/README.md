# Deployment guide

Choose the topology by its state-sharing requirement: use Local Development
while editing, Simple Compose for a single-process demo, Full Compose to test
the app/worker split, Render for the hosted demo, or Generic Docker for a
production-oriented platform. PostgreSQL is authoritative in every mode;
multi-instance deployments also need shared Redis state and Kafka-backed event
delivery.

## Choose a mode

| Mode              | Best for                                                      | Application processes                 | PostgreSQL              | KV adapter               | Event adapter            | File storage           |
| ----------------- | ------------------------------------------------------------- | ------------------------------------- | ----------------------- | ------------------------ | ------------------------ | ---------------------- |
| Local development | Editing with hot reload and production-like dependencies      | API and Vite run on the host          | Compose container       | Redis container          | Kafka container          | MinIO                  |
| Simple Compose    | Fastest self-contained demo                                   | One `app` container                   | Compose container       | Process memory           | Process memory           | Filesystem volume      |
| Full Compose      | Testing the production process split locally                  | `app` and `worker` containers         | Compose container       | Redis container          | Kafka container          | MinIO                  |
| Render Blueprint  | Small hosted demo                                             | One Render web service                | Managed Render database | Managed Render Key Value | Process memory           | Render persistent disk |
| Generic Docker    | Kubernetes, ECS, another PaaS, or manually managed containers | One or more `app`/`worker` containers | External service        | PostgreSQL or Redis      | Memory or external Kafka | Filesystem or S3       |

All modes use PostgreSQL as the authoritative data store. Redis provides
secondary auth and KV state; it does not replace PostgreSQL. Kafka is the only
included event adapter that connects separate publisher and subscriber
processes.

Do not horizontally scale an explicitly memory-backed deployment. By default,
application instances share PostgreSQL KV; `REDIS_URL` selects Redis instead.
Both provide shared atomic keys, TTLs, counters, and auth secondary state.

## Production minimums

- Replace every committed development credential and store secrets in the
  platform's secret manager.
- Use a long, random `BETTER_AUTH_SECRET` and correct HTTPS values for
  `BETTER_AUTH_URL` and `CORS_ORIGIN`.
- Keep PostgreSQL, Redis, and Kafka on private authenticated networks with TLS
  where supported; back up PostgreSQL and test restoration.
- Use a separate high-entropy `FILES_SIGNING_SECRET` for filesystem URLs, or
  private S3 credentials and a client-reachable HTTPS presigning endpoint.
- Use Redis for shared KV and auth state when running multiple app instances.
- Use Kafka with separate workers when events must cross processes, survive app
  restarts, or scale independently.
- Preserve `SIGTERM`, configure `/api/health`, and allow graceful shutdown.

The supplied Compose credentials, plaintext internal protocols, and memory
adapters are local/demo defaults, not a production security template.

## Shared runtime architecture

The production image has two roles:

| Role            | Entrypoint argument | Responsibility                                                                                    |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| Web application | `app`               | Applies Drizzle migrations, starts Hono, serves `/api`, and serves the compiled React application |
| Event worker    | `worker`            | Starts registered event subscribers without HTTP or migrations                                    |

The image defaults to the `app` role. Platforms that override both Docker
`ENTRYPOINT` and `CMD` must invoke `mba-desk-backend-entrypoint app` explicitly;
the Render Blueprint leaves the Docker command unset so the image default is
preserved.

The Hono health endpoint is `GET /api/health`. Production containers listen on `PORT`; the supplied Compose profiles set it to `8080`, while Render injects it.

The adapter choices come entirely from environment variables:

- `KV_ADAPTER=postgres`: use the shared PostgreSQL `kv.entries` table.
  `KV_ADAPTER=memory|redis` selects those adapters explicitly. When unset,
  `REDIS_URL` selects Redis and its absence selects PostgreSQL.
- Both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS` set: use Kafka. Both unset: use process-local events. Setting only one is a startup error.
- `ENABLE_WORKER_IN_PROCESS=true`: register subscribers in the web application. This is required when using memory events and no separate worker.
- `ENABLE_WORKER_IN_PROCESS=false`: the web application only publishes. Run a `worker` process using the same Kafka brokers.
- `FILES_ADAPTER=fs`: store files below `FILES_DIRECTORY` and route signed
  transfers through Hono. `FILES_ADAPTER=s3`: store objects in S3 and return
  native SigV4 URLs. `FILES_ADAPTER=postgres`: store blobs in
  `files.__files` and route signed transfers through Hono. PostgreSQL mode is
  strictly for quick tests and short-lived demos without a persistent
  filesystem. It is not recommended for production or general use; use S3 in
  production.

Never put a memory-mode publisher and its only subscriber in separate processes. Memory events cannot cross a process boundary, are not replayed, and disappear at restart.

## Scaling model

Scaling has three independent state planes:

| State plane                    | Single-process option                                  | Multi-instance option               | What it protects                                                                                   |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Authoritative application data | PostgreSQL                                             | The same shared PostgreSQL database | Durable records, uniqueness, transactions, and webhook idempotency                                 |
| KV and auth secondary state    | Memory KV                                              | PostgreSQL or Redis                 | Shared keys, atomic counters, TTLs, and cross-instance coordination without per-process collisions |
| Event delivery                 | Memory event bus with embedded subscribers             | Kafka with separate workers         | Cross-process delivery, consumer groups, and independent worker scaling                            |
| File storage                   | Persistent filesystem; PostgreSQL only for quick tests | Shared S3-compatible object storage | Durable bytes and direct signed upload/download access                                             |

Redis solves shared KV coordination; it does not turn the memory event adapter into a distributed event bus. A horizontally scaled production deployment should normally use both Redis and Kafka: Redis for shared state across app instances, and Kafka for decoupled event delivery to workers. PostgreSQL unique constraints remain the final protection against duplicate webhook persistence and event retries.

When scaling:

- App replicas should share `DATABASE_URL` and the same KV adapter configuration.
- App and worker replicas should share `KAFKA_BROKERS`.
- Worker replicas that jointly process one workload should share `KAFKA_GROUP_ID`.
- `ENABLE_WORKER_IN_PROCESS` should be `false` when Kafka-backed workers are deployed separately.
- Memory KV is appropriate only when exactly one application process owns all KV-dependent state.

## Requirements

For host-based development:

- Node.js 24 or newer
- Corepack with Yarn 1.22.22
- Docker or Podman with Compose

For container-only modes, Docker or Podman with Compose is sufficient. The Docker image itself uses Node.js 24 on Debian Bookworm.

Install the host dependencies once when using local development:

```bash
corepack enable
yarn install --frozen-lockfile
```

## Configuration reference

| Variable                      | Required               | Used by             | Purpose                                                                              |
| ----------------------------- | ---------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                    | Production             | App, auth, database | Enables production validation and behavior                                           |
| `PORT`                        | No                     | App                 | HTTP listen port; defaults to `3000` outside supplied containers                     |
| `DATABASE_URL`                | Production             | App and worker      | PostgreSQL connection string                                                         |
| `ENCRYPTION_KEY`              | Production             | App and worker      | Stable canonical base64-encoded 256-bit database field-encryption key                |
| `KV_ADAPTER`                  | No                     | App                 | `memory`, `postgres` (default), or `redis`; `REDIS_URL` selects Redis when unset     |
| `REDIS_URL`                   | No                     | App                 | Selects Redis KV when present; supports `redis://` and `rediss://`                   |
| `KAFKA_CLIENT_ID`             | With `KAFKA_BROKERS`   | App and worker      | Kafka client identity                                                                |
| `KAFKA_BROKERS`               | With `KAFKA_CLIENT_ID` | App and worker      | Comma-separated Kafka broker addresses                                               |
| `KAFKA_GROUP_ID`              | No                     | Subscriber process  | Consumer group; defaults to `<client-id>-consumer`                                   |
| `ENABLE_WORKER_IN_PROCESS`    | No                     | App                 | Enables registered subscribers inside the HTTP process                               |
| `SUBSCRIBE_TO_TOPICS`         | No                     | Subscriber process  | `all` or a comma-separated list of registered topics                                 |
| `WA_WEBHOOK_MAX_RETRIES`      | No                     | Subscriber process  | Webhook retries before dead-lettering; defaults to `5` and accepts `0` through `100` |
| `WEBHOOK_ARCHIVE_ENABLED`     | No                     | Subscriber process  | Saves processed webhook payloads and timing data; defaults to `true`                 |
| `FILES_ADAPTER`               | No                     | App                 | `fs` (default), `postgres`, or `s3`; PostgreSQL is test/demo-only                    |
| `FILES_DIRECTORY`             | FS                     | App                 | Durable filesystem storage root                                                      |
| `FILES_PUBLIC_URL`            | FS/Postgres production | App                 | Public Hono base URL used in application-served signed links                         |
| `FILES_SIGNING_SECRET`        | FS/Postgres production | App                 | HMAC secret of at least 32 bytes                                                     |
| `FILES_S3_BUCKET`             | S3                     | App                 | Object bucket                                                                        |
| `FILES_S3_CREATE_BUCKET`      | S3                     | App                 | Creates a missing bucket lazily; intended for local/demo infrastructure              |
| `FILES_S3_REGION`             | S3                     | App                 | Signing region; defaults to `us-east-1`                                              |
| `FILES_S3_ENDPOINT`           | S3-compatible          | App                 | Internal endpoint used for object operations                                         |
| `FILES_S3_PUBLIC_ENDPOINT`    | S3-compatible          | App                 | Client-reachable endpoint used when signing URLs                                     |
| `FILES_S3_FORCE_PATH_STYLE`   | S3-compatible          | App                 | Enables path-style bucket URLs                                                       |
| `FILES_S3_ACCESS_KEY_ID`      | With static S3 secret  | App                 | Static credential; omit both credential values for the AWS provider chain            |
| `FILES_S3_SECRET_ACCESS_KEY`  | With static S3 key     | App                 | Static credential; configure together with the access key                            |
| `BETTER_AUTH_SECRET`          | Production             | App                 | High-entropy Better Auth signing secret                                              |
| `BETTER_AUTH_URL`             | Production             | App                 | Public base URL, including `https://` in hosted environments                         |
| `BETTER_AUTH_TRUSTED_ORIGINS` | With OIDC              | App                 | Comma-separated exact IdP discovery, token, authorization, and JWKS origins          |
| `BETTER_AUTH_ADMIN_USER_IDS`  | No                     | App                 | Comma-separated user IDs that receive the admin role                                 |
| `CORS_ORIGIN`                 | No                     | App                 | Exact trusted browser origin; defaults to `http://localhost:5173`                    |
| `WEB_ROOT`                    | No                     | App                 | Static frontend directory; defaults to `../web/dist` from the API working directory  |
| `WEB_PORT`                    | Compose only           | Compose             | Host port mapped to container port `8080`                                            |
| `COMPOSE_BETTER_AUTH_URL`     | Compose only           | Compose             | Public auth URL injected as `BETTER_AUTH_URL`                                        |
| `COMPOSE_CORS_ORIGIN`         | Compose only           | Compose             | Browser origin injected as `CORS_ORIGIN`                                             |
| `COMPOSE_FILES_PUBLIC_URL`    | Simple Compose only    | Compose             | Public base URL injected as `FILES_PUBLIC_URL`                                       |

The development values committed in `.env.example`, `.env.dev`, and the Compose defaults are intentionally insecure. Do not reuse them on a public deployment.

## Mode 1: local development

This mode runs PostgreSQL, Redis, Kafka, and MinIO in containers while the API
and Vite development servers run directly on the host. It provides hot reload
and exercises every external adapter without rebuilding an application image.

### Start

```bash
cp .env.dev .env
docker compose -f compose.dev.yaml up -d --wait
yarn db:migrate
yarn dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the Hono API at <http://localhost:3000>.

The services exposed only on loopback are:

| Service    | Address          |
| ---------- | ---------------- |
| PostgreSQL | `localhost:5432` |
| Redis      | `localhost:6379` |
| Kafka      | `localhost:9092` |
| MinIO API  | `localhost:9000` |
| MinIO UI   | `localhost:9001` |

`.env.dev` enables the in-process worker. The API therefore publishes to Kafka and also consumes subscribed Kafka topics in the same host process; no worker container is started.

Unlike the container application role, host development does not automatically run migrations. Run `yarn db:migrate` after first setup and whenever migrations change.

### Inspect and stop

```bash
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs -f
docker compose -f compose.dev.yaml down
```

The `mba-desk-dev` project name and `dev-*` volumes isolate
development data from the other Compose modes. To deliberately remove all
development PostgreSQL, Redis, Kafka, and MinIO data:

```bash
docker compose -f compose.dev.yaml down --volumes
```

### Optional memory adapters during development

To avoid using Redis or Kafka from the host process, remove `REDIS_URL`,
`KAFKA_CLIENT_ID`, `KAFKA_BROKERS`, and `KAFKA_GROUP_ID` from `.env`. Keep
`ENABLE_WORKER_IN_PROCESS=true`. To use local filesystem files instead of
MinIO, copy the filesystem variables from `.env.example`. PostgreSQL is still
required.

## Mode 2: Simple Compose

The simple profile is the smallest self-contained application deployment. It runs only PostgreSQL and one application container. Hono serves both the API and compiled frontend at <http://localhost:8080> by default.

### Characteristics

- PostgreSQL data survives container replacement in the `postgres-data` volume.
- File bodies and metadata survive in the `files-data` volume.
- KV and event data live only in the application process.
- Subscribers run inside that same process.
- The application entrypoint applies migrations before opening the HTTP server.
- It has fewer services and lower resource usage than the full profile.
- It cannot move event handling into a separate process or provide event replay.
- It must not be horizontally scaled: each replica would have isolated KV and auth secondary state rather than one coordinated keyspace.

### Configure and start

Create a root `.env` file or export the interpolation variables in your shell. At minimum, replace the secret and set externally correct URLs if callers will not use `localhost:8080`:

```env
BETTER_AUTH_SECRET=replace-with-a-high-entropy-secret
FILES_SIGNING_SECRET=replace-with-an-independent-high-entropy-secret
COMPOSE_BETTER_AUTH_URL=http://localhost:8080
COMPOSE_CORS_ORIGIN=http://localhost:8080
COMPOSE_FILES_PUBLIC_URL=http://localhost:8080
BETTER_AUTH_ADMIN_USER_IDS=
WEB_PORT=8080
SUBSCRIBE_TO_TOPICS=all
```

Start and verify the stack:

```bash
docker compose -f compose.simple.yaml up --build -d --wait
docker compose -f compose.simple.yaml ps
curl --fail http://localhost:8080/api/health
```

Follow logs and stop without deleting PostgreSQL data:

```bash
docker compose -f compose.simple.yaml logs -f app postgres
docker compose -f compose.simple.yaml down
```

Use `docker compose -f compose.simple.yaml down --volumes` only when
intentionally resetting both the database and stored files.

This mode is suitable for demos and single-process environments. It is not suitable when events must survive process failure, when event consumers must scale independently, or when KV state must be shared across instances.

## Mode 3: Full Compose

The full profile runs the production process split locally:

- `postgres`: authoritative application and auth data.
- `redis`: shared KV and Better Auth secondary storage with append-only persistence.
- `kafka`: event transport with a persistent named volume.
- `minio`: S3-compatible file storage with a persistent named volume.
- `app`: HTTP server, static frontend, and Kafka publisher; in-process subscribers are disabled.
- `worker`: Kafka consumer and database-backed webhook persistence process.

Redis lets multiple application instances share atomic KV state without colliding, while Kafka consumer groups let multiple worker instances process events in parallel without every worker handling the same record. The supplied Compose file starts one of each, but its topology demonstrates both scaling boundaries.

### Configure and start

Use the same root `.env` values shown for Simple Compose, replacing every development credential before exposing the stack. Then run:

```bash
docker compose up --build -d --wait
docker compose ps
curl --fail http://localhost:8080/api/health
```

The application waits for PostgreSQL, Redis, Kafka, and MinIO. In this local
profile, the S3 adapter creates a missing bucket on first use. The worker waits
for a healthy application and broker. Only the `app` role runs migrations. S3
operations use the internal MinIO hostname, while signed URLs default to the
client-reachable `http://localhost:9000` endpoint.

Inspect the request and consumer paths independently:

```bash
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f postgres redis kafka
```

Stop while retaining all named volumes:

```bash
docker compose down
```

Delete all full-profile data only when intentional:

```bash
docker compose down --volumes
```

The full profile is the correct local choice for validating asynchronous webhook ingestion, Kafka routing, worker restarts, and process isolation. Its infrastructure uses development credentials and plaintext internal protocols, so the file is not a production security template.

## Mode 4: Render Blueprint

[`render.yaml`](../../render.yaml) provisions the hosted demo topology:

- One free Docker web service running the `app` role without a persistent disk.
- One free Render PostgreSQL database.
- One free Render Key Value service using the Redis-compatible adapter.
- No Kafka service and no separate worker.

The web service sets `ENABLE_WORKER_IN_PROCESS=true` and
`FILES_ADAPTER=postgres`.
Each request is published to the memory event adapter and handled inside the
same web process. Redis provides shared KV, while file bodies are stored in
`files.__files` in the Render PostgreSQL database.

The PostgreSQL files adapter is a deliberate quick-testing compromise for this
diskless demo Blueprint. It is not recommended for production or general use:
database blobs increase database size, backup/restore time, replication
traffic, and memory pressure. Configure the S3-compatible adapter for a
production deployment.

The managed Redis-compatible service means additional web instances can share KV and Better Auth secondary state without process-local collisions. Event handling remains embedded and instance-local, so Render scale-out still does not provide a shared event queue, replay, or a separately scalable worker tier.

### Deploy

1. Push the repository to a Git provider supported by Render.
2. In Render, create a new Blueprint and select the repository containing `render.yaml`.
3. Review the three resources that will be created: the web service,
   PostgreSQL, and Key Value.
4. Supply the prompted environment values:

   | Variable                     | Value                                                                        |
   | ---------------------------- | ---------------------------------------------------------------------------- |
   | `BETTER_AUTH_URL`            | Final public service URL, such as `https://mba-desk.onrender.com`            |
   | `ENCRYPTION_KEY`             | Stable base64-encoded 256-bit key generated with `openssl rand -base64 32`   |
   | `CORS_ORIGIN`                | Browser origin allowed to call the API; normally the same public URL         |
   | `FILES_PUBLIC_URL`           | Public base for application-served signed URLs; normally the same public URL |
   | `BETTER_AUTH_ADMIN_USER_IDS` | Optional comma-separated Better Auth user IDs                                |

5. Apply the Blueprint and wait for the web service health check at `/api/health`.
6. Confirm `https://<service-host>/api/health` returns a successful response.

Render injects `DATABASE_URL`, `REDIS_URL`, and `PORT`. It generates
`BETTER_AUTH_SECRET` and `FILES_SIGNING_SECRET`. The application entrypoint
applies migrations on every web deployment before starting Hono; a migration
failure prevents the service from becoming healthy. The database boundary
removes Render's `verifySSL` compatibility query parameter before passing the
URL to Postgres.js while preserving supported `ssl` and `sslmode` settings.
`ENCRYPTION_KEY` is a manually synchronized secret because rotating or losing
it without re-encrypting stored values makes channel credentials unreadable.

### Render limitations

- The Blueprint uses PostgreSQL for file blobs only to support a diskless quick
  test. Do not treat that adapter or free-service retention as production-safe.
- In-memory events are not replayable and disappear on restart.
- Event subscribers cannot be moved to a separate service without also adding Kafka or another shared event implementation.
- The Key Value service uses `allkeys-lru`; it is secondary storage, not the authoritative database.
- For production scale-out, use a shared event broker, set `ENABLE_WORKER_IN_PROCESS=false`, and deploy the `worker` role separately.

## Mode 5: generic Docker deployment

The same image can run on another container platform with externally managed services.

### Build

```bash
docker build --target runtime -t mba-desk:latest .
```

The image runs as the unprivileged `node` user, uses `SIGTERM`, and includes the compiled API, web application, libraries, and Drizzle migrations.

### Single-container application

For a single application instance with memory events, provide PostgreSQL and keep subscribers embedded:

```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:password@database-host:5432/database
ENABLE_WORKER_IN_PROCESS=true
SUBSCRIBE_TO_TOPICS=all
BETTER_AUTH_SECRET=replace-with-a-high-entropy-secret
BETTER_AUTH_URL=https://app.example.com
CORS_ORIGIN=https://app.example.com
FILES_ADAPTER=fs
FILES_DIRECTORY=/var/lib/mba-desk/files
FILES_PUBLIC_URL=https://app.example.com
FILES_SIGNING_SECRET=replace-with-an-independent-high-entropy-secret
```

```bash
docker run --name mba-desk-app --env-file production.env -p 8080:8080 mba-desk:latest app
```

Use a hostname reachable from inside the container in `DATABASE_URL`;
container-local `localhost` refers to the container itself. Mount a persistent,
writable volume at `FILES_DIRECTORY`, or configure the S3 adapter instead.
PostgreSQL mode can remove the volume requirement for a quick test, but is not
recommended for production or general use.

### Split application and worker

For independent event processing, configure both processes with the same PostgreSQL database and Kafka brokers:

- App: set `ENABLE_WORKER_IN_PROCESS=false`, `KAFKA_CLIENT_ID`, and `KAFKA_BROKERS`.
- Worker: set `DATABASE_URL`, `KAFKA_CLIENT_ID`, `KAFKA_BROKERS`, `KAFKA_GROUP_ID`, and `SUBSCRIBE_TO_TOPICS`.
- Set `REDIS_URL` on every application instance that needs shared KV. The current worker does not use KV.

Run the same image with different role arguments:

```bash
docker run --env-file app.env -p 8080:8080 mba-desk:latest app
docker run --env-file worker.env mba-desk:latest worker
```

All worker replicas using the same `KAFKA_GROUP_ID` share delivery as one consumer group. Use distinct group IDs only when separate logical consumers must each receive every event.

All application replicas must use the same database and KV adapter
configuration. Leaving `REDIS_URL` unset uses the shared PostgreSQL database;
`KV_ADAPTER=memory` is isolated per process and must not be horizontally scaled.

### Platform requirements

- Route HTTPS traffic to the app's configured `PORT`.
- Preserve `SIGTERM` and allow enough shutdown time for database, Redis, Kafka,
  file-store, and HTTP connections to close.
- Keep PostgreSQL, Redis, Kafka, and object storage on private authenticated
  networks with TLS where supported.
- Coordinate app rollouts because the `app` role applies migrations before startup. Avoid starting incompatible application versions concurrently around breaking schema changes.
- Configure platform health checks against `/api/health`.
- Do not run a separate worker when the app uses memory events.

## Feature comparison

| Capability                                     | Local development                        | Simple Compose          | Full Compose              | Render Blueprint          | Generic Docker                 |
| ---------------------------------------------- | ---------------------------------------- | ----------------------- | ------------------------- | ------------------------- | ------------------------------ |
| Hot reload                                     | Yes                                      | No                      | No                        | No                        | No                             |
| Compiled frontend served by Hono               | No; Vite serves it                       | Yes                     | Yes                       | Yes                       | Yes                            |
| Automatic migrations on app start              | No                                       | Yes                     | Yes                       | Yes                       | Yes                            |
| Durable primary data                           | Named PostgreSQL volume                  | Named PostgreSQL volume | Named PostgreSQL volume   | Managed PostgreSQL        | External PostgreSQL            |
| Shared KV                                      | Redis                                    | No                      | Redis                     | Render Key Value          | Optional Redis                 |
| Multiple app instances share KV safely         | Not applicable; one app process          | No                      | Yes                       | Yes                       | Yes, when Redis is configured  |
| Durable/cross-process events                   | Kafka                                    | No                      | Kafka                     | No                        | Optional Kafka                 |
| Durable file storage                           | MinIO volume                             | Filesystem volume       | MinIO volume              | Persistent disk           | Filesystem volume or S3        |
| Separate worker                                | No                                       | No                      | Yes                       | No                        | Optional                       |
| Parallel workers without duplicate consumption | No separate workers                      | No                      | Yes, through Kafka groups | No                        | Yes, through Kafka groups      |
| Webhook processing decoupled from HTTP process | No; Kafka is consumed by the API process | No                      | Yes                       | No                        | Yes with Kafka and worker      |
| Default public port                            | `5173` frontend, `3000` API              | `8080`                  | `8080`                    | Render-assigned HTTPS URL | Platform-defined               |
| Built-in TLS                                   | No                                       | No                      | No                        | Yes, at Render edge       | Platform-dependent             |
| Intended production scalability                | No                                       | No                      | Local validation only     | Demo/small hosted use     | Yes, with managed dependencies |

## WhatsApp webhook deployment

The callback path is:

```text
https://<public-host>/api/wa-cloud/webhook/<channel-id>
```

Before Meta can deliver traffic, the referenced WhatsApp channel must exist in PostgreSQL and its WABA ID, phone-number ID, display phone number, app secret, and webhook verification token must be configured on that channel row.

- Meta's verification GET uses the channel's `wa_webhook_verify_token`.
- Webhook POST requests must carry a valid `X-Hub-Signature-256` generated with the channel's stored app secret.
- The payload WABA and phone metadata must match that same channel.
- Local Compose endpoints are plain HTTP and not publicly reachable. Use an HTTPS development tunnel or reverse proxy when testing callbacks from Meta; no tunnel is included in this repository.

Migration `0001_short_iron_man` generates a unique verification token for every channel that predates this column. After applying it, retrieve or replace each generated token through a trusted administrative path and update the corresponding Meta webhook subscription. Treat verification tokens as secrets and never write them to application logs.

## Operations and data lifecycle

### Health and logs

Use `/api/health` for readiness and liveness checks. It confirms that the HTTP
process is running; it does not execute deep PostgreSQL, Redis, Kafka, or object
storage probes. Compose separately health-checks those dependencies.

For Compose deployments:

```bash
docker compose ps
docker compose logs -f app worker
curl --fail http://localhost:8080/api/health
```

Add `-f compose.simple.yaml` or `-f compose.dev.yaml` when operating those projects.

### Persistence and backups

- Back up PostgreSQL according to the database provider's procedures. It is the authoritative store in every mode.
- Redis is secondary storage and should be treated according to the selected provider's durability guarantees.
- Kafka retention and replication determine replay availability. The included single-broker Compose setup is for local validation, not fault tolerance.
- Back up filesystem storage with its mounted volume. For S3, configure bucket
  durability, lifecycle, and backup according to the provider.
- The Compose Kafka services set `KAFKA_LOG_DIRS=/var/lib/kafka/data` so their named volumes contain the broker log rather than leaving it under the image's `/tmp` default.
- `docker compose down` preserves named volumes. `docker compose down --volumes` deletes them.
- Never treat container filesystems or memory adapters as persistent storage.

### Updates

Before deploying a new revision:

```bash
yarn quality
yarn build
```

Rebuild the image, deploy the `app` role so migrations run, verify `/api/health`, and then replace workers. For destructive or backward-incompatible migrations, use an explicit expand/migrate/contract rollout rather than relying on simultaneous container replacement.

## Troubleshooting

| Symptom                                     | Likely cause                                                                     | Check                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Production exits before listening           | Missing required auth, database, or filesystem variable                          | `DATABASE_URL`, auth variables, `FILES_PUBLIC_URL`, `FILES_SIGNING_SECRET`                  |
| Signed filesystem URL returns `403`         | URL expired, changed, used with the wrong method, or has a content-type mismatch | Regenerate it and preserve the method, query string, and signed `Content-Type`              |
| MinIO signed URL cannot connect             | Public endpoint uses the internal Compose hostname                               | Set `FILES_S3_PUBLIC_ENDPOINT` to a client-reachable URL                                    |
| Kafka startup configuration error           | Only one Kafka selector was set                                                  | Set both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS`, or remove both                              |
| Events publish but are not persisted        | Subscriber is not colocated with memory events, or worker is not consuming Kafka | `ENABLE_WORKER_IN_PROCESS`, app/worker broker addresses, `SUBSCRIBE_TO_TOPICS`, worker logs |
| Webhook returns `401`                       | Signature does not match the stored channel app secret                           | Raw request body, `X-Hub-Signature-256`, channel secret                                     |
| Webhook returns `400`                       | Invalid schema or WABA/phone metadata mismatch                                   | Response issues and channel configuration                                                   |
| Webhook returns `404`                       | URL channel ID does not exist                                                    | `/api/wa-cloud/webhook/<channel-id>` and database channel row                               |
| Authentication callbacks use the wrong host | Public auth URL is incorrect                                                     | `BETTER_AUTH_URL` and proxy forwarding configuration                                        |
| Browser CORS errors                         | Browser origin differs from configured origin                                    | Exact scheme, host, and port in `CORS_ORIGIN`                                               |
| Container cannot reach a host dependency    | `localhost` points at the container                                              | Use a Compose service name, host gateway, or managed-service hostname                       |
| App never becomes healthy after deployment  | Migration or startup failure                                                     | App logs before the `API listening` message                                                 |

## Final production checks

Before exposing the deployment, verify the production minimums near the top of
this guide. Also use a separate private webhook verification token, restrict
`CORS_ORIGIN` to the actual browser origin, monitor app and worker failures
independently, and pin and review image updates.
