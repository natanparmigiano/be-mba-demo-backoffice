# Container deployment

The repository builds one production image with separate Workspace and Manager
application roles, a migration role, and two worker roles. Use Simple Compose for
a two-application demo and Full Compose to validate Kafka-backed worker
isolation. Each application serves its own `/api` surface and matching compiled
React SPA, so the image does not need Nginx or another static-file proxy.

| Profile               | Use it for                                     | Processes             | File storage      |
| --------------------- | ---------------------------------------------- | --------------------- | ----------------- |
| `compose.dev.yaml`    | Host development with production-like services | Host API/Vite         | MinIO             |
| `compose.simple.yaml` | Smallest self-contained demo                   | Two apps              | Filesystem volume |
| `compose.yaml`        | Local app/worker split validation              | Two apps, two workers | MinIO             |

The committed credentials and plaintext service connections are local/demo
defaults, not a production security template.

## Quick start

From the repository root, start the smallest complete deployment:

```bash
docker compose -f compose.simple.yaml up --build -d --wait
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8081/api/health
```

Workspace is available at <http://localhost:8080> and Manager at
<http://localhost:8081>. Use `podman compose` in place of `docker compose` when
running Podman. See the [deployment guide](../deployment/README.md) before exposing a
profile outside a local or demo environment.

## Image construction

The root `Dockerfile` uses these stages:

1. `yarn-base` selects Yarn 1.22.22 and copies workspace manifests.
2. `development-dependencies` installs the frozen dependency graph for compilation.
3. `build` compiles every workspace.
4. `production-dependencies` installs production-only dependencies.
5. `runtime` copies compiled output, Drizzle migrations, and the entrypoint into a Node 24 slim image.

The runtime process runs as the unprivileged `node` user, exposes port 8080,
uses `SIGTERM` as its stop signal, and sets `NODE_OPTIONS=--no-node-snapshot` as
required by `isolated-vm`.

## Entrypoint roles

`mba-desk-backend-entrypoint` accepts one of five commands. The image defaults
to the Workspace application, while deployment profiles select the other roles
explicitly:

| Command            | Behavior                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `workspace-app`    | Executes `apps/api-workspace/dist/index.js`, serving the Workspace API and SPA |
| `manager-app`      | Executes `apps/api-manager/dist/index.js`, serving the Manager API and SPA     |
| `migrate`          | Applies Drizzle migrations, then exits                                         |
| `workspace-worker` | Consumes Workspace-owned WhatsApp webhook topics without HTTP or migrations    |
| `manager-worker`   | Consumes Manager-owned Runner execution topics without HTTP or migrations      |

An unknown or missing role exits with usage error code 64. Every role uses
`exec`, making Node PID 1 and allowing it to receive container signals
directly. Application and worker startup never applies migrations; Compose
runs the standalone `migrate` service first and starts dependent services only
after it succeeds.

## Development infrastructure

`compose.dev.yaml` runs only the services needed by host-based development. It does not build or start the application:

| Service    | Host address     | Purpose                                     |
| ---------- | ---------------- | ------------------------------------------- |
| PostgreSQL | `localhost:5432` | Application and authentication data         |
| Redis      | `localhost:6379` | KV and Better Auth secondary storage        |
| Kafka      | `localhost:9092` | Event publishing and in-process subscribers |
| MinIO      | `localhost:9000` | S3-compatible file storage                  |
| MinIO UI   | `localhost:9001` | Local object-storage administration         |

Start the services and wait for their health checks:

```bash
cp .env.dev .env
docker compose -f compose.dev.yaml up -d --wait
yarn db:migrate
yarn dev
```

`.env.dev` points the locally running Node processes at these published ports.
It enables each application's own in-process subscribers because there are no
worker containers in this profile.

Inspect or stop the infrastructure with:

```bash
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs -f
docker compose -f compose.dev.yaml down
```

The development profile has its own Compose project name and named volumes, so
its PostgreSQL, Redis, Kafka, and MinIO data is isolated from the full and
simple application stacks. To intentionally reset all development service
data:

```bash
docker compose -f compose.dev.yaml down --volumes
```

Both Kafka profiles explicitly set `KAFKA_LOG_DIRS=/var/lib/kafka/data`, matching the named-volume mount. Without that override, the Apache Kafka image writes its default broker log under `/tmp` and the declared volume does not preserve topic data.

## Full profile

```bash
docker compose up --build
```

`compose.yaml` starts:

| Service            | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `postgres`         | Durable application and auth data                       |
| `redis`            | KV and Better Auth secondary storage                    |
| `kafka`            | Event transport                                         |
| `minio`            | S3-compatible file storage                              |
| `migrate`          | One-shot schema migration                               |
| `workspace-app`    | Workspace API/SPA on host port 8080 and Kafka publisher |
| `manager-app`      | Manager API/SPA on host port 8081 and Kafka publisher   |
| `workspace-worker` | Kafka subscriber for Workspace webhook topics           |
| `manager-worker`   | Kafka subscriber for Manager Runner topics              |

Both apps wait for a successful migration and for Redis, Kafka, and MinIO. Their
in-process workers are explicitly disabled, and the S3 adapter creates its
bucket lazily in this local profile. Each worker waits for its owning app,
Kafka, and MinIO and subscribes only to its package registry. The Workspace
worker uses the same S3 configuration when archiving
WhatsApp webhook media. Container-side object operations use `http://minio:9000`; generated browser URLs use
`FILES_S3_PUBLIC_ENDPOINT`, which defaults to `http://localhost:9000`.

## Simple profile

```bash
docker compose -f compose.simple.yaml up --build
```

This starts PostgreSQL, the one-shot migration, and separate Workspace and
Manager applications. `KV_ADAPTER=postgres` provides shared secondary storage,
while the missing Kafka configuration selects in-memory events. Both apps run
their own subscriber registry with `ENABLE_WORKER_IN_PROCESS=true`, keeping
each publisher and its consumers in the same process. Workspace owns webhook
ingress and WhatsApp processing; Manager consumes queued Runner execution
requests. Both applications mount the durable `files-data` volume at
`/var/lib/mba-desk/files`; the rest of the application filesystem remains
read-only.

Do not split a memory-mode publisher and worker into separate containers: process-local events cannot cross that boundary.

## Operations

Both profiles expose the Workspace application at <http://localhost:8080> and
the Manager application at <http://localhost:8081> by default. Override their
host ports independently:

```bash
WORKSPACE_WEB_PORT=9080 MANAGER_WEB_PORT=9081 docker compose up
```

Useful checks:

```bash
docker compose ps
docker compose logs -f workspace-app manager-app workspace-worker manager-worker
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8081/api/health
```

Each app health check calls its `/api/health`. PostgreSQL uses `pg_isready`,
Redis uses `PING`, and Kafka verifies both topic and consumer-group commands.

Compose mounts named volumes for durable services:

- `postgres-data` in both profiles.
- `files-data` in the simple profile.
- `redis-data`, `kafka-data`, and `minio-data` in the full profile.

`docker compose down` stops containers while preserving named volumes. Adding `--volumes` destroys local service data and should be used deliberately.

The shared application containers use a read-only filesystem, a `/tmp` tmpfs,
`no-new-privileges`, and `restart: unless-stopped` in the full profile.

## Production requirements

Before deployment:

- Replace `BETTER_AUTH_SECRET` with a high-entropy secret.
- Set externally correct auth and CORS URLs.
- Replace embedded PostgreSQL credentials.
- Replace `FILES_SIGNING_SECRET` in filesystem mode.
- Configure TLS/authentication or managed services for PostgreSQL, Redis,
  Kafka, and S3-compatible storage.
- Decide which topics each worker owns and set `SUBSCRIBE_TO_TOPICS` explicitly.
- Use distinct, stable Kafka consumer group IDs when workloads require independent delivery.

Podman users can run the same flows with `podman compose`.

## Render Blueprint

The root `render.yaml` describes a hosted split-application
demo. Applying it creates:

- A Workspace Docker web service running `workspace-app`.
- A Manager Docker web service running `manager-app`.
- One free Render PostgreSQL database.
- One free Render Key Value service for Redis-compatible shared KV storage.

Both web services run only their own in-process subscriber registry. The
Manager service runs the standalone `migrate` role as its pre-deploy
command. It uses the Starter plan because Render does not offer pre-deploy
commands on free web services; Workspace remains free. The Blueprint defines
no Kafka or separate worker. The injected `REDIS_URL` selects the Redis KV
adapter, while the absence of Kafka variables selects the in-memory event
adapter. `FILES_ADAPTER=postgres` stores file blobs in `files.__files` so the
diskless services can run without filesystem storage. This mode is strictly a
hosted demo; use S3-compatible storage and a shared event broker with the
matching standalone worker roles for production.

Render supplies `PORT` at runtime, so the Blueprint does not override it. `DATABASE_URL` and `REDIS_URL` are populated from their services' internal connection strings, and Render generates `BETTER_AUTH_SECRET`. The Key Value service has no public IP allowlist and uses `allkeys-lru` eviction when it reaches its memory limit.

During Blueprint creation, Render prompts for public variables on each web
service:

| Variable                 | Value                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `BETTER_AUTH_URL`        | That service's final public URL                               |
| `CORS_ORIGIN`            | That service's public browser origin                          |
| app-specific CORS origin | Match Workspace or Manager CORS to the generic value          |
| `FILES_PUBLIC_URL`       | That service's public base for application-served signed URLs |

These values are intentionally not hard-coded because Render can assign a different hostname and production deployments may use a custom domain.

### Plan constraints

- The Manager uses the `starter` plan because its migration is a Render
  pre-deploy command; Workspace can remain on the free plan.
- The free Key Value service is shared across app instances but is non-authoritative cache/secondary storage; its availability, persistence, and capacity follow Render's current free-plan terms.
- In-memory events work because Workspace webhook publication and consumption
  are colocated, while Manager Runner publication and consumption are
  colocated in the Manager service.
- PostgreSQL remains the authoritative durable store; its free-tier retention and capacity are governed by Render's current plan terms.
- A future event-processing scale-out must add Kafka or an equivalent shared event service and move subscribers to the matching standalone worker roles.

The Blueprint is declarative configuration only. Committing `render.yaml` does not create resources; resources are created only after the repository is connected and the Blueprint is applied in Render.
