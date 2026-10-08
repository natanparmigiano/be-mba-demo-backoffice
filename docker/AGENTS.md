# Container and deployment agent guide

The repository builds one production image with separate Workspace and Manager
application and worker roles, plus a one-shot migration role. Keep Docker,
Compose, Render, and deployment documentation consistent.

## Documentation

- Read and update `documentation/docs/archive/docker/` and
  `documentation/docs/archive/deployment/` whenever images, entrypoint roles, Compose
  profiles, Render services, health checks, environment variables, or rollout
  procedures change.
- Keep Docusaurus navigation labels and links current. Present the quick-start
  deployment path first, followed by profile-specific reference,
  production-hardening guidance, and troubleshooting.
- Do not add deployment README files beside Docker or Compose sources.

## Image and entrypoint

- Preserve the multi-stage build separation between compilation, production
  dependencies, and runtime output.
- Keep the runtime unprivileged, the Compose application filesystem read-only,
  `/tmp` on tmpfs, and `no-new-privileges` enabled unless a documented runtime
  need requires otherwise.
- `workspace-app` and `manager-app` start their matching Hono API and embedded
  React SPA. `workspace-worker` and `manager-worker` run only their matching
  subscriber registry. `migrate` applies database migrations as a separate
  one-shot command.
- Use `exec` so Node remains PID 1 and receives signals directly;
  unknown/missing roles return usage error 64.
- Do not add a reverse proxy merely for static delivery without an explicit
  deployment requirement.

## Deployment profiles

- `compose.dev.yaml` is infrastructure-only for host-based application
  development.
- `compose.yaml` uses PostgreSQL, Redis, Kafka, both app publishers, and separate
  Workspace and Manager workers. Keep `ENABLE_WORKER_IN_PROCESS=false` on both
  apps there.
- `compose.simple.yaml` uses PostgreSQL plus process-local KV/events. Keep the
  Workspace and Manager subscriber registries in their owning app processes;
  memory events cannot cross containers.
- `render.yaml` follows the per-app in-process event model but uses managed
  PostgreSQL and Redis-compatible KV. It intentionally has no Kafka workers.
- Retain health/dependency checks and durable volume paths. In particular,
  Kafka's configured log directory must match its mounted volume.

## Security and documentation

- Compose credentials are demo defaults only. Production guidance must require
  a high-entropy auth secret, correct public auth/CORS URLs, and secured managed
  data services.
- Never hard-code a Render-assigned hostname or production credential.
- Update the relevant pages under `documentation/docs/archive/deployment/` and
  `documentation/docs/archive/docker/`, the documentation site's configuration
  reference, and `.env.example` together when runtime variables or profile
  behavior change.
- Validate shell entrypoint syntax and build/Compose configuration relevant to
  the change; use the health endpoint for runtime smoke checks when available.
