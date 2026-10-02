# Container and deployment agent guide

The repository builds one production image that can run as an `app` or
`worker`. Keep Docker, Compose, Render, and deployment documentation consistent.

## Image and entrypoint

- Preserve the multi-stage build separation between compilation, production
  dependencies, and runtime output.
- Keep the runtime unprivileged, the Compose application filesystem read-only,
  `/tmp` on tmpfs, and `no-new-privileges` enabled unless a documented runtime
  need requires otherwise.
- The `app` role applies migrations before starting Hono. The `worker` role does
  not run migrations or start HTTP. Use `exec` so Node remains PID 1 and receives
  signals directly; unknown/missing roles return usage error 64.
- Hono serves both `/api` and the compiled React SPA. Do not add a reverse proxy
  merely for static delivery without an explicit deployment requirement.

## Deployment profiles

- `compose.dev.yaml` is infrastructure-only for host-based application
  development.
- `compose.yaml` uses PostgreSQL, Redis, Kafka, an app publisher, and a separate
  worker. Keep `ENABLE_WORKER_IN_PROCESS=false` there.
- `compose.simple.yaml` uses PostgreSQL plus process-local KV/events. Keep the
  subscriber in the app process; memory events cannot cross containers.
- `render.yaml` follows the single-process event model but uses managed
  PostgreSQL and Redis-compatible KV. It intentionally has no Kafka worker.
- Retain health/dependency checks and durable volume paths. In particular,
  Kafka's configured log directory must match its mounted volume.

## Security and documentation

- Compose credentials are demo defaults only. Production guidance must require
  a high-entropy auth secret, correct public auth/CORS URLs, and secured managed
  data services.
- Never hard-code a Render-assigned hostname or production credential.
- Update `docs/deployment/README.md`, `docker/README.md`, root configuration tables, and
  `.env.example` together when runtime variables or profile behavior change.
- Validate shell entrypoint syntax and build/Compose configuration relevant to
  the change; use the health endpoint for runtime smoke checks when available.
