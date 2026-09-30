# Deployment guide

This document is the authoritative guide to every deployment mode shipped in this repository. It covers local development, the smallest container stack, the full local stack, Render, and deployment of the shared Docker image to another container platform.

## Choose a mode

| Mode              | Best for                                                      | Application processes                 | PostgreSQL              | KV adapter               | Event adapter            | Event subscribers                                |
| ----------------- | ------------------------------------------------------------- | ------------------------------------- | ----------------------- | ------------------------ | ------------------------ | ------------------------------------------------ |
| Local development | Editing with hot reload and production-like dependencies      | API and Vite run on the host          | Compose container       | Redis container          | Kafka container          | Inside the API process                           |
| Simple Compose    | Fastest self-contained demo                                   | One `app` container                   | Compose container       | Process memory           | Process memory           | Inside the app process                           |
| Full Compose      | Testing the production process split locally                  | `app` and `worker` containers         | Compose container       | Redis container          | Kafka container          | Dedicated worker process                         |
| Render Blueprint  | Small hosted demo                                             | One Render web service                | Managed Render database | Managed Render Key Value | Process memory           | Inside the web process                           |
| Generic Docker    | Kubernetes, ECS, another PaaS, or manually managed containers | One or more `app`/`worker` containers | External service        | Memory or external Redis | Memory or external Kafka | Embedded or separate, matching the event adapter |

All modes use PostgreSQL as the authoritative data store. Redis is secondary storage for Better Auth and other KV use; it does not replace PostgreSQL. Kafka is the only included event adapter that can connect separate publisher and subscriber processes.

Redis is also an important horizontal-scaling boundary. With `REDIS_URL`, every application instance uses the same atomic keyspace, TTLs, counters, and auth secondary state, so replicas can work in parallel without maintaining conflicting process-local copies. Without Redis, each instance has an independent in-memory KV store; that is safe for a single process but not a shared-state multi-instance deployment.

## Shared runtime architecture

The production image has two roles:

| Role            | Entrypoint argument | Responsibility                                                                                    |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| Web application | `app`               | Applies Drizzle migrations, starts Hono, serves `/api`, and serves the compiled React application |
| Event worker    | `worker`            | Starts registered event subscribers without HTTP or migrations                                    |

The Hono health endpoint is `GET /api/health`. Production containers listen on `PORT`; the supplied Compose profiles set it to `8080`, while Render injects it.

The adapter choices come entirely from environment variables:

- `REDIS_URL` set: use Redis. Unset: use process-local memory.
- Both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS` set: use Kafka. Both unset: use process-local events. Setting only one is a startup error.
- `ENABLE_WORKER_IN_PROCESS=true`: register subscribers in the web application. This is required when using memory events and no separate worker.
- `ENABLE_WORKER_IN_PROCESS=false`: the web application only publishes. Run a `worker` process using the same Kafka brokers.

Never put a memory-mode publisher and its only subscriber in separate processes. Memory events cannot cross a process boundary, are not replayed, and disappear at restart.

## Scaling model

Scaling has three independent state planes:

| State plane                    | Single-process option                      | Multi-instance option               | What it protects                                                                                   |
| ------------------------------ | ------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Authoritative application data | PostgreSQL                                 | The same shared PostgreSQL database | Durable records, uniqueness, transactions, and webhook idempotency                                 |
| KV and auth secondary state    | Memory KV                                  | Redis through `REDIS_URL`           | Shared keys, atomic counters, TTLs, and cross-instance coordination without per-process collisions |
| Event delivery                 | Memory event bus with embedded subscribers | Kafka with separate workers         | Cross-process delivery, consumer groups, and independent worker scaling                            |

Redis solves shared KV coordination; it does not turn the memory event adapter into a distributed event bus. A horizontally scaled production deployment should normally use both Redis and Kafka: Redis for shared state across app instances, and Kafka for decoupled event delivery to workers. PostgreSQL unique constraints remain the final protection against duplicate webhook persistence and event retries.

When scaling:

- App replicas should share `DATABASE_URL` and `REDIS_URL`.
- App and worker replicas should share `KAFKA_BROKERS`.
- Worker replicas that jointly process one workload should share `KAFKA_GROUP_ID`.
- `ENABLE_WORKER_IN_PROCESS` should be `false` when Kafka-backed workers are deployed separately.
- Memory KV is appropriate only when exactly one application process owns all KV-dependent state.

## Requirements

For host-based development:

- Node.js 20.19 or newer
- Corepack with Yarn 1.22.22
- Docker or Podman with Compose

For container-only modes, Docker or Podman with Compose is sufficient. The Docker image itself uses Node.js 24 on Debian Bookworm.

Install the host dependencies once when using local development:

```bash
corepack enable
yarn install --frozen-lockfile
```

## Configuration reference

| Variable                     | Required               | Used by             | Purpose                                                                             |
| ---------------------------- | ---------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                   | Production             | App, auth, database | Enables production validation and behavior                                          |
| `PORT`                       | No                     | App                 | HTTP listen port; defaults to `3000` outside supplied containers                    |
| `DATABASE_URL`               | Production             | App and worker      | PostgreSQL connection string                                                        |
| `REDIS_URL`                  | No                     | App                 | Selects Redis KV when present; supports `redis://` and `rediss://`                  |
| `KAFKA_CLIENT_ID`            | With `KAFKA_BROKERS`   | App and worker      | Kafka client identity                                                               |
| `KAFKA_BROKERS`              | With `KAFKA_CLIENT_ID` | App and worker      | Comma-separated Kafka broker addresses                                              |
| `KAFKA_GROUP_ID`             | No                     | Subscriber process  | Consumer group; defaults to `<client-id>-consumer`                                  |
| `ENABLE_WORKER_IN_PROCESS`   | No                     | App                 | Enables registered subscribers inside the HTTP process                              |
| `SUBSCRIBE_TO_TOPICS`        | No                     | Subscriber process  | `all` or a comma-separated list of registered topics                                |
| `BETTER_AUTH_SECRET`         | Production             | App                 | High-entropy Better Auth signing secret                                             |
| `BETTER_AUTH_URL`            | Production             | App                 | Public base URL, including `https://` in hosted environments                        |
| `BETTER_AUTH_ADMIN_USER_IDS` | No                     | App                 | Comma-separated user IDs that receive the admin role                                |
| `CORS_ORIGIN`                | No                     | App                 | Exact trusted browser origin; defaults to `http://localhost:5173`                   |
| `WEB_ROOT`                   | No                     | App                 | Static frontend directory; defaults to `../web/dist` from the API working directory |
| `WEB_PORT`                   | Compose only           | Compose             | Host port mapped to container port `8080`                                           |
| `COMPOSE_BETTER_AUTH_URL`    | Compose only           | Compose             | Public auth URL injected as `BETTER_AUTH_URL`                                       |
| `COMPOSE_CORS_ORIGIN`        | Compose only           | Compose             | Browser origin injected as `CORS_ORIGIN`                                            |

The development values committed in `.env.example`, `.env.dev`, and the Compose defaults are intentionally insecure. Do not reuse them on a public deployment.

## Mode 1: local development

This mode runs PostgreSQL, Redis, and Kafka in containers while the API and Vite development servers run directly on the host. It provides hot reload and exercises the external adapters without rebuilding an application image.

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

`.env.dev` enables the in-process worker. The API therefore publishes to Kafka and also consumes subscribed Kafka topics in the same host process; no worker container is started.

Unlike the container application role, host development does not automatically run migrations. Run `yarn db:migrate` after first setup and whenever migrations change.

### Inspect and stop

```bash
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs -f
docker compose -f compose.dev.yaml down
```

The `mba-demo-backoffice-dev` project name and `dev-*` volumes isolate development data from the other Compose modes. To deliberately remove all development PostgreSQL, Redis, and Kafka data:

```bash
docker compose -f compose.dev.yaml down --volumes
```

### Optional memory adapters during development

To avoid using Redis or Kafka from the host process, remove `REDIS_URL`, `KAFKA_CLIENT_ID`, `KAFKA_BROKERS`, and `KAFKA_GROUP_ID` from `.env`. Keep `ENABLE_WORKER_IN_PROCESS=true`. PostgreSQL is still required.

## Mode 2: Simple Compose

The simple profile is the smallest self-contained application deployment. It runs only PostgreSQL and one application container. Hono serves both the API and compiled frontend at <http://localhost:8080> by default.

### Characteristics

- PostgreSQL data survives container replacement in the `postgres-data` volume.
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
COMPOSE_BETTER_AUTH_URL=http://localhost:8080
COMPOSE_CORS_ORIGIN=http://localhost:8080
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

Use `docker compose -f compose.simple.yaml down --volumes` only when intentionally resetting the database.

This mode is suitable for demos and single-process environments. It is not suitable when events must survive process failure, when event consumers must scale independently, or when KV state must be shared across instances.

## Mode 3: Full Compose

The full profile runs the production process split locally:

- `postgres`: authoritative application and auth data.
- `redis`: shared KV and Better Auth secondary storage with append-only persistence.
- `kafka`: event transport with a persistent named volume.
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

The application waits for PostgreSQL, Redis, and Kafka health checks. The worker waits for a healthy application and broker. Only the `app` role runs migrations.

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

[`render.yaml`](render.yaml) provisions the hosted demo topology:

- One free Docker web service running the `app` role.
- One free Render PostgreSQL database.
- One free Render Key Value service using the Redis-compatible adapter.
- No Kafka service and no separate worker.

The web service sets `ENABLE_WORKER_IN_PROCESS=true`. Each request is published to the memory event adapter and handled inside the same web process. Redis provides shared KV, but it does not make the event bus durable.

The managed Redis-compatible service means additional web instances can share KV and Better Auth secondary state without process-local collisions. Event handling remains embedded and instance-local, so Render scale-out still does not provide a shared event queue, replay, or a separately scalable worker tier.

### Deploy

1. Push the repository to a Git provider supported by Render.
2. In Render, create a new Blueprint and select the repository containing `render.yaml`.
3. Review the three resources that will be created: web service, PostgreSQL, and Key Value.
4. Supply the prompted environment values:

   | Variable                     | Value                                                                        |
   | ---------------------------- | ---------------------------------------------------------------------------- |
   | `BETTER_AUTH_URL`            | Final public service URL, such as `https://mba-demo-backoffice.onrender.com` |
   | `CORS_ORIGIN`                | Browser origin allowed to call the API; normally the same public URL         |
   | `BETTER_AUTH_ADMIN_USER_IDS` | Optional comma-separated Better Auth user IDs                                |

5. Apply the Blueprint and wait for the web service health check at `/api/health`.
6. Confirm `https://<service-host>/api/health` returns a successful response.

Render injects `DATABASE_URL`, `REDIS_URL`, and `PORT`. It generates `BETTER_AUTH_SECRET`. The application entrypoint applies migrations on every web deployment before starting Hono; a migration failure prevents the service from becoming healthy.

### Render limitations

- Free services may sleep, restart, or have plan-specific retention and capacity limits. Check Render's current terms before relying on them.
- In-memory events are not replayable and disappear on restart.
- Event subscribers cannot be moved to a separate service without also adding Kafka or another shared event implementation.
- The Key Value service uses `allkeys-lru`; it is secondary storage, not the authoritative database.
- For production scale-out, use a shared event broker, set `ENABLE_WORKER_IN_PROCESS=false`, and deploy the `worker` role separately.

## Mode 5: generic Docker deployment

The same image can run on another container platform with externally managed services.

### Build

```bash
docker build --target runtime -t mba-demo-backoffice:latest .
```

The image runs as the unprivileged `node` user, uses `SIGTERM`, and includes the compiled API, web application, libraries, and Drizzle migrations. The synthetic webhook generator is a development/load-testing workspace and is not copied into the runtime image.

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
```

```bash
docker run --name mba-demo-app --env-file production.env -p 8080:8080 mba-demo-backoffice:latest app
```

Use a hostname reachable from inside the container in `DATABASE_URL`; container-local `localhost` refers to the container itself.

### Split application and worker

For independent event processing, configure both processes with the same PostgreSQL database and Kafka brokers:

- App: set `ENABLE_WORKER_IN_PROCESS=false`, `KAFKA_CLIENT_ID`, and `KAFKA_BROKERS`.
- Worker: set `DATABASE_URL`, `KAFKA_CLIENT_ID`, `KAFKA_BROKERS`, `KAFKA_GROUP_ID`, and `SUBSCRIBE_TO_TOPICS`.
- Set `REDIS_URL` on every application instance that needs shared KV. The current worker does not use KV.

Run the same image with different role arguments:

```bash
docker run --env-file app.env -p 8080:8080 mba-demo-backoffice:latest app
docker run --env-file worker.env mba-demo-backoffice:latest worker
```

All worker replicas using the same `KAFKA_GROUP_ID` share delivery as one consumer group. Use distinct group IDs only when separate logical consumers must each receive every event.

All application replicas must use the same `REDIS_URL` when KV-backed state is shared. Leaving it unset gives every replica an isolated memory store, which can produce conflicting state and prevents reliable coordination between instances.

### Platform requirements

- Route HTTPS traffic to the app's configured `PORT`.
- Preserve `SIGTERM` and allow enough shutdown time for database, Redis, Kafka, and HTTP connections to close.
- Keep PostgreSQL, Redis, and Kafka on private authenticated networks with TLS where supported.
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

The synthetic generator can target any reachable deployment. See [`apps/webhook-generator/README.md`](apps/webhook-generator/README.md) for signing and load options.

Migration `0001_short_iron_man` generates a unique verification token for every channel that predates this column. After applying it, retrieve or replace each generated token through a trusted administrative path and update the corresponding Meta webhook subscription. Treat verification tokens as secrets and never write them to application logs.

## Operations and data lifecycle

### Health and logs

Use `/api/health` for readiness and liveness checks. It confirms that the HTTP process is running; it does not execute deep PostgreSQL, Redis, or Kafka probes. Compose separately health-checks those dependencies.

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
| Production exits before listening           | Missing required auth or database variable                                       | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                     |
| Kafka startup configuration error           | Only one Kafka selector was set                                                  | Set both `KAFKA_CLIENT_ID` and `KAFKA_BROKERS`, or remove both                              |
| Events publish but are not persisted        | Subscriber is not colocated with memory events, or worker is not consuming Kafka | `ENABLE_WORKER_IN_PROCESS`, app/worker broker addresses, `SUBSCRIBE_TO_TOPICS`, worker logs |
| Webhook returns `401`                       | Signature does not match the stored channel app secret                           | Raw request body, `X-Hub-Signature-256`, channel secret                                     |
| Webhook returns `400`                       | Invalid schema or WABA/phone metadata mismatch                                   | Response issues and channel configuration                                                   |
| Webhook returns `404`                       | URL channel ID does not exist                                                    | `/api/wa-cloud/webhook/<channel-id>` and database channel row                               |
| Authentication callbacks use the wrong host | Public auth URL is incorrect                                                     | `BETTER_AUTH_URL` and proxy forwarding configuration                                        |
| Browser CORS errors                         | Browser origin differs from configured origin                                    | Exact scheme, host, and port in `CORS_ORIGIN`                                               |
| Container cannot reach a host dependency    | `localhost` points at the container                                              | Use a Compose service name, host gateway, or managed-service hostname                       |
| App never becomes healthy after deployment  | Migration or startup failure                                                     | App logs before the `API listening` message                                                 |

## Security checklist

- Replace every committed development credential.
- Use a long, random `BETTER_AUTH_SECRET` and a separate private webhook verification token.
- Store secrets in the platform's secret manager, not in committed `.env` files.
- Terminate TLS before the app and use HTTPS public URLs for auth and Meta webhooks.
- Restrict `CORS_ORIGIN` to the actual browser origin.
- Restrict database, Redis, and Kafka network access; enable authentication and encryption for hosted deployments.
- Back up PostgreSQL and test restoration.
- Monitor app and worker failures separately when using Kafka.
- Pin and review image updates before production rollout.
