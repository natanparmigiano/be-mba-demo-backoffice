# API agent guide

This workspace owns HTTP routing, authentication mounting, event publication
and subscription, process startup/shutdown, and production SPA delivery.

## HTTP and RPC contracts

- Keep route composition chained in `src/app.ts`; `AppType` is inferred from
  that chain and consumed by the web workspace.
- Prefer route factories with injectable infrastructure so tests do not need
  PostgreSQL, Redis, Kafka, or a running server.
- Validate request input at the boundary and return stable JSON error shapes.
  Preserve JSON 404s for `/api` paths when changing static-file fallback.
- Keep browser CORS credential-aware and update allowed methods deliberately
  when adding mutating routes.
- Client-side guards are not authorization. Enforce admin and organization
  permissions independently on server endpoints.

## WhatsApp webhook invariants

- Resolve a positive safe-integer channel ID and verify channel ownership data
  before accepting traffic.
- Verify the signature against the exact raw request bytes with a constant-time
  comparison before parsing JSON.
- Retain the 1 MiB request limit, validate through the shared Zod schema, and
  reject WABA/phone metadata that does not match the channel.
- Publish the original body so downstream signature fidelity and lossless
  ingestion are preserved. Keep channel ID metadata consistent between event
  key, headers, and payload.
- Ingestion must remain transactional, idempotent under webhook retries, and
  monotonic for out-of-order status updates.

## Events and lifecycle

- Declare stable versioned topic names near publishers and register handlers in
  `src/subscribers.ts`.
- Register every subscription before `events.start()`; the Kafka adapter cannot
  add subscriptions after startup through this abstraction.
- Unknown requested topics must fail startup rather than silently doing no work.
- Keep app and worker shutdown idempotent. Unsubscribe handlers and close the
  HTTP server, database, KV store, and event bus on `SIGINT`/`SIGTERM`.
- Memory-mode publishers and subscribers must share the app process. Separate
  workers require Kafka.

## Verification

```bash
yarn workspace @mba-desk/api typecheck
yarn workspace @mba-desk/api test
yarn workspace @mba-desk/api build
```

Add route contract tests for status codes and response bodies, plus focused
tests for injected failure/security paths and worker topic selection.
