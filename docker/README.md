# Container deployment

The repository builds one production image with `app` and `worker` roles. Use
Simple Compose for a one-process demo and Full Compose to validate Kafka-backed
worker isolation. Hono serves both `/api` and the compiled React application,
so the image does not need Nginx or another static-file proxy.

| Profile               | Use it for                                     | Processes          | File storage      |
| --------------------- | ---------------------------------------------- | ------------------ | ----------------- |
| `compose.dev.yaml`    | Host development with production-like services | Host API/Vite      | MinIO             |
| `compose.simple.yaml` | Smallest self-contained demo                   | One `app`          | Filesystem volume |
| `compose.yaml`        | Local app/worker split validation              | `app` and `worker` | MinIO             |

The committed credentials and plaintext service connections are local/demo
defaults, not a production security template.

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

`mba-demo-backend-entrypoint` requires one command:

| Command  | Behavior                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| `app`    | Applies Drizzle migrations, then executes `apps/api/dist/index.js`             |
| `worker` | Executes `apps/api/dist/worker.js` without starting HTTP or running migrations |

An unknown or missing role exits with usage error code 64. Both roles use `exec`, making Node PID 1 and allowing it to receive container signals directly.

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

`.env.dev` points the locally running Node process at these published ports. It enables the in-process worker because there is no worker container in this profile.

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

| Service    | Purpose                                    |
| ---------- | ------------------------------------------ |
| `postgres` | Durable application and auth data          |
| `redis`    | KV and Better Auth secondary storage       |
| `kafka`    | Event transport                            |
| `minio`    | S3-compatible file storage                 |
| `app`      | Hono API/static server and Kafka publisher |
| `worker`   | Kafka subscriber process                   |

The app waits for PostgreSQL, Redis, Kafka, and MinIO. Its in-process worker is
explicitly disabled, and the S3 adapter creates its bucket lazily in this local
profile. The worker waits for Kafka and MinIO, subscribes according to
`SUBSCRIBE_TO_TOPICS`, and uses the same S3 configuration when archiving
WhatsApp webhook media. Container-side object operations use `http://minio:9000`; generated browser URLs use
`FILES_S3_PUBLIC_ENDPOINT`, which defaults to `http://localhost:9000`.

## Simple profile

```bash
docker compose -f compose.simple.yaml up --build
```

This starts only PostgreSQL and the app. Because neither `REDIS_URL` nor Kafka
configuration is provided, KV and events select their memory adapters.
`ENABLE_WORKER_IN_PROCESS=true` ensures publishers and subscribers share the
same app process. Files use the durable `files-data` volume mounted at
`/var/lib/mba-demo/files`; the rest of the application filesystem remains
read-only.

Do not split a memory-mode publisher and worker into separate containers: process-local events cannot cross that boundary.

## Operations

Both profiles expose the application at <http://localhost:8080> by default. Override the host port with `WEB_PORT`:

```bash
WEB_PORT=8081 docker compose up
```

Useful checks:

```bash
docker compose ps
docker compose logs -f app worker
curl --fail http://localhost:8080/api/health
```

The app health check calls `/api/health`. PostgreSQL uses `pg_isready`, Redis uses `PING`, and Kafka verifies both topic and consumer-group commands.

Compose mounts named volumes for durable services:

- `postgres-data` in both profiles.
- `files-data` in the simple profile.
- `redis-data`, `kafka-data`, and `minio-data` in the full profile.

`docker compose down` stops containers while preserving named volumes. Adding `--volumes` destroys local service data and should be used deliberately.

The shared application containers use a read-only filesystem, a `/tmp` tmpfs, `no-new-privileges`, and `restart: unless-stopped` in the full profile.

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

The root [`render.yaml`](../render.yaml) describes the hosted equivalent of the simple profile. Applying it creates:

- One free Docker web service using the `app` entrypoint role without a
  persistent disk.
- One free Render PostgreSQL database.
- One free Render Key Value service for Redis-compatible shared KV storage.

It intentionally defines no Kafka or separate worker services.
`ENABLE_WORKER_IN_PROCESS=true` keeps the event handlers in the web process.
The injected `REDIS_URL` selects the Redis KV adapter, while the absence of
Kafka variables selects the in-memory event adapter. `FILES_ADAPTER=postgres`
stores file blobs in `files.__files` so the demo can run without a filesystem.
This mode is strictly for quick testing and is not recommended for production
or general use; configure S3-compatible storage for production.

Render supplies `PORT` at runtime, so the Blueprint does not override it. `DATABASE_URL` and `REDIS_URL` are populated from their services' internal connection strings, and Render generates `BETTER_AUTH_SECRET`. The Key Value service has no public IP allowlist and uses `allkeys-lru` eviction when it reaches its memory limit.

During Blueprint creation, Render prompts for three non-synchronized variables:

| Variable           | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`  | The final public service URL, such as `https://mba-demo-backoffice.onrender.com`                  |
| `CORS_ORIGIN`      | The browser origin allowed to call the API; for the bundled app, use the same public service URL  |
| `FILES_PUBLIC_URL` | The public service URL used as the base for application-served signed URLs; normally the same URL |

These values are intentionally not hard-coded because Render can assign a different hostname and production deployments may use a custom domain.

The app entrypoint applies pending Drizzle migrations before starting the server. A failed migration prevents the service from becoming healthy.

### Plan constraints

- Persistent disks require a paid Render web-service plan, so the Blueprint
  uses `starter`; changing it to `free` makes the disk configuration invalid.
- The free Key Value service is shared across app instances but is non-authoritative cache/secondary storage; its availability, persistence, and capacity follow Render's current free-plan terms.
- In-memory events work only because the free profile uses one app process.
- PostgreSQL remains the authoritative durable store; its free-tier retention and capacity are governed by Render's current plan terms.
- A future event-processing scale-out must add Kafka or an equivalent shared event service and move subscribers to the standalone `worker` role.

The Blueprint is declarative configuration only. Committing `render.yaml` does not create resources; resources are created only after the repository is connected and the Blueprint is applied in Render.
